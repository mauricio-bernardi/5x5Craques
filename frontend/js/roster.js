// Cadastro de jogadores e apelidos (nicks escritos errado, nicks antigos).
// Qualquer apelido digitado no sorteio é trocado pelo nome oficial do jogador.

let roster = [];            // [{ id, name, aliases: [{ id, alias }] }], em ordem alfabética
let nameIndex = new Map();  // nome oficial ou apelido normalizado -> jogador
let rosterLoaded = false;

// Jogador dono deste nome ou apelido (ou null se ninguém tiver esse nome).
function findPlayer(name) {
    return nameIndex.get(norm(name)) || null;
}

// Nome oficial correspondente; nomes desconhecidos voltam como foram digitados.
function canonicalName(name) {
    const p = findPlayer(name);
    return p ? p.name : name.trim();
}

async function fetchRoster() {
    const [players, aliases] = await Promise.all([
        api('players?select=id,name&order=name.asc&limit=1000'),
        api('player_aliases?select=id,player_id,alias&order=alias.asc&limit=5000')
    ]);

    const byId = new Map(players.map(p => [p.id, { id: p.id, name: p.name, aliases: [] }]));

    for (const a of aliases) {
        const p = byId.get(a.player_id);
        if (p) p.aliases.push({ id: a.id, alias: a.alias });
    }

    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

// Chamado por refreshRanking(): recarrega a lista e redesenha a seção.
async function refreshRoster() {
    if (!backendOn()) {
        rosterLoaded = false;
        renderRoster();
        return;
    }

    try {
        roster = await fetchRoster();
        rosterLoaded = true;
    } catch (err) {
        rosterLoaded = false;
        rosterStatus('⚠️ Não foi possível carregar os jogadores: ' + err.message +
            ' (rode o schema.sql atualizado no Supabase).');
    }

    nameIndex = new Map();

    for (const p of roster) {
        nameIndex.set(norm(p.name), p);
        for (const a of p.aliases) nameIndex.set(norm(a.alias), p);
    }

    // Sugestões ao digitar nos campos do sorteio.
    const list = $('playerSuggestions');
    list.replaceChildren(...roster.map(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        return opt;
    }));

    renderRoster();
}

function rosterStatus(text) {
    $('rosterStatus').textContent = text;
}

// Executa uma função protegida por senha e recarrega tudo (ranking e histórico usam os nomes oficiais).
async function rosterAction(fn, args, okMsg) {
    try {
        await rpc(fn, args);
        rosterStatus(okMsg);
        await refreshRanking();
        return true;
    } catch (err) {
        rosterStatus('⚠️ ' + err.message);
        return false;
    }
}

// Confere se o nome pode ser usado por este jogador (ou por um novo, se player for null).
function nameFree(name, player) {
    const owner = findPlayer(name);

    if (owner && owner !== player) {
        rosterStatus(`⚠️ "${name}" já é ${norm(owner.name) === norm(name) ? 'um jogador' : 'apelido de ' + owner.name}.`);
        return false;
    }

    return true;
}

function renderRoster() {
    const box = $('rosterList');
    box.replaceChildren();

    if (!backendOn()) {
        box.append(cell('p', 'Configure o Supabase para cadastrar jogadores.', 'none'));
        return;
    }

    if (!rosterLoaded) return;

    const q = searchKey($('rosterSearch').value);

    const shown = roster.filter(p =>
        !q || searchKey(p.name).includes(q) || p.aliases.some(a => searchKey(a.alias).includes(q))
    );

    if (!shown.length) {
        box.append(cell('p', roster.length
            ? 'Nenhum jogador encontrado.'
            : 'Nenhum jogador ainda. Adicione acima ou registre uma partida.', 'none'));
        return;
    }

    for (const p of shown) box.append(rosterRow(p));
}

function rosterRow(p) {
    const row = document.createElement('div');
    row.className = 'roster-row';

    // Nome e resumo do ranking.
    const s = playerStat(p.name);
    const info = document.createElement('div');
    info.className = 'roster-name';
    info.append(
        cell('b', p.name),
        cell('small', s ? `${Math.round(s.rating)} · ${s.games} jogo${s.games === 1 ? '' : 's'}` : 'sem jogos')
    );
    info.title = p.name;

    // Apelidos.
    const aliases = document.createElement('div');
    aliases.className = 'aliases';

    for (const a of p.aliases) {
        const chip = document.createElement('span');
        chip.className = 'alias';

        const del = cell('button', '×');
        del.type = 'button';
        del.title = `Remover o apelido "${a.alias}"`;
        del.addEventListener('click', () => {
            rosterAction('remove_alias', { p_alias_id: a.id }, `🗑️ Apelido "${a.alias}" removido de ${p.name}.`);
        });

        chip.append(cell('span', a.alias), del);
        aliases.append(chip);
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'alias-input';
    input.maxLength = 30;
    input.placeholder = '+ apelido';
    input.title = 'Digite um apelido e aperte Enter';
    input.addEventListener('keydown', async e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();

        const alias = input.value.trim();
        if (!alias || !nameFree(alias, null)) return;

        input.disabled = true;
        const ok = await rosterAction('add_alias', { p_player_id: p.id, p_alias: alias },
            `✅ "${alias}" agora é apelido de ${p.name}.`);
        input.disabled = false;
        if (!ok) input.focus();
    });

    aliases.append(input);

    // Ações.
    const actions = document.createElement('div');
    actions.className = 'roster-actions';

    const rename = cell('button', '✏️', 'btn btn-ghost btn-sm');
    rename.type = 'button';
    rename.title = 'Renomear (o nome atual vira apelido)';
    rename.addEventListener('click', () => renamePlayer(p));

    const merge = cell('button', '🔗', 'btn btn-ghost btn-sm');
    merge.type = 'button';
    merge.title = 'Juntar com outro jogador (mesma pessoa cadastrada duas vezes)';
    merge.addEventListener('click', () => mergePlayer(p));

    actions.append(rename, merge);

    if (!s) {
        const del = cell('button', '🗑️', 'btn btn-danger btn-sm');
        del.type = 'button';
        del.title = 'Excluir (só para quem ainda não jogou)';
        del.addEventListener('click', () => {
            if (confirm(`Excluir "${p.name}" e os apelidos dele?`)) {
                rosterAction('delete_player', { p_player_id: p.id }, `🗑️ ${p.name} excluído.`);
            }
        });
        actions.append(del);
    }

    row.append(info, aliases, actions);

    return row;
}

function renamePlayer(p) {
    const name = (prompt(`Novo nome oficial para "${p.name}":\n("${p.name}" continua valendo como apelido.)`, p.name) || '').trim();

    if (!name || name === p.name || !nameFree(name, p)) return;

    rosterAction('rename_player', { p_player_id: p.id, p_new_name: name }, `✏️ ${p.name} agora se chama ${name}.`);
}

function mergePlayer(p) {
    const answer = (prompt(
        `"${p.name}" é a mesma pessoa que qual jogador?\n` +
        `Digite o nome (ou apelido) de quem vai continuar. As partidas de "${p.name}" passam para ele ` +
        `e "${p.name}" vira apelido.`
    ) || '').trim();

    if (!answer) return;

    const target = findPlayer(answer);

    if (!target) {
        rosterStatus(`⚠️ Nenhum jogador chamado "${answer}".`);
        return;
    }

    if (target === p) {
        rosterStatus('⚠️ Escolha um jogador diferente.');
        return;
    }

    if (!confirm(`Juntar "${p.name}" em "${target.name}"?\n\nO ranking será recalculado e isso não pode ser desfeito automaticamente.`)) {
        return;
    }

    rosterAction('merge_players', { p_from: p.id, p_into: target.id }, `🔗 ${p.name} foi juntado em ${target.name}.`);
}

$('rosterAdd').addEventListener('submit', async e => {
    e.preventDefault();

    const name = $('rosterNew').value.trim();
    if (!name || !nameFree(name, null)) return;

    if (await rosterAction('add_player', { p_name: name }, `✅ ${name} cadastrado.`)) {
        $('rosterNew').value = '';
    }
});

$('rosterSearch').addEventListener('input', renderRoster);

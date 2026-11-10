// Cadastro de jogadores: nick, link do op.gg e apelidos (nicks antigos ou escritos errado).
// O painel fica escondido atrás do botão "Adicionar jogador", que pede a senha do grupo.
// Os jogadores cadastrados aparecem no ranking e viram sugestões nos campos do sorteio.

let roster = [];             // [{ id, name, opgg_url, aliases: [{ id, alias }] }], em ordem alfabética
let nameIndex = new Map();   // nome oficial ou apelido normalizado -> jogador
let looseIndex = new Map();  // mesmo, ignorando acentos/espaços/símbolos -> jogador (null se ambíguo)
let rosterLoaded = false;

// ---------- Busca de jogadores ----------
// Acha o jogador pelo nome oficial ou apelido. Se não achar exato, tenta ignorando
// maiúsculas, acentos, espaços e símbolos ("joao silva" acha "João Silva").
function findPlayer(name) {
    const exact = nameIndex.get(norm(name));
    if (exact) return exact;

    const k = searchKey(name);
    return (k && looseIndex.get(k)) || null;
}

// Nome oficial correspondente; nomes desconhecidos voltam como foram digitados.
function canonicalName(name) {
    const p = findPlayer(name);
    return p ? p.name : name.trim();
}

function buildIndexes() {
    nameIndex = new Map();
    looseIndex = new Map();

    const addLoose = (text, p) => {
        const k = searchKey(text);
        if (!k) return;
        // Dois jogadores diferentes com a mesma chave: não dá para adivinhar, então nenhum.
        looseIndex.set(k, looseIndex.has(k) && looseIndex.get(k) !== p ? null : p);
    };

    for (const p of roster) {
        nameIndex.set(norm(p.name), p);
        addLoose(p.name, p);

        for (const a of p.aliases) {
            nameIndex.set(norm(a.alias), p);
            addLoose(a.alias, p);
        }
    }
}

// ---------- Link do op.gg ----------
// Aceita os formatos do op.gg:
//   https://op.gg/lol/summoners/br/Nick-BR1   (atual, com ou sem idioma: /pt/lol/...)
//   https://www.op.gg/summoners/br/Nick-BR1
//   https://br.op.gg/summoner/userName=Nick   (antigo, sem tag)
// Devolve { name, url } com o link sempre no formato https://op.gg/lol/summoners/...
function parseOpgg(text) {
    const raw = text.trim();
    let u;

    try {
        u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
    } catch (e) {
        return null;
    }

    if (!/(^|\.)op\.gg$/i.test(u.hostname)) return null;

    const decode = s => { try { return decodeURIComponent(s); } catch (e) { return s; } };
    const parts = u.pathname.split('/').filter(Boolean).map(decode);
    const i = parts.findIndex(p => /^summoners?$/i.test(p));

    if (i < 0) return null;

    let region;
    let riotId;
    const old = (parts[i + 1] || '').match(/^userName=(.+)$/i) || [];

    if (old[1] || u.searchParams.get('userName')) {
        riotId = old[1] || u.searchParams.get('userName');
        region = u.hostname.split('.').length > 2 ? u.hostname.split('.')[0] : 'br';
        if (region === 'www') region = 'br';
    } else if (parts[i + 2]) {
        region = parts[i + 1];
        riotId = parts[i + 2];
    } else {
        return null;
    }

    // Riot ID no link: "Nome-TAG". O nome pode ter espaços; a tag vem depois do último hífen.
    const dash = riotId.lastIndexOf('-');
    const name = (dash > 0 ? riotId.slice(0, dash) : riotId).trim();
    const tag = dash > 0 ? riotId.slice(dash + 1).trim() : '';

    if (!name || name.length > 30 || !/^[a-z0-9_]{2,8}$/i.test(region)) return null;

    const url = `https://op.gg/lol/summoners/${region.toLowerCase()}/` +
        encodeURIComponent(name) + (tag ? '-' + encodeURIComponent(tag) : '');

    return { name, url };
}

// Texto digitado no cadastro/edição: link do op.gg ou só o nick.
function readPlayerInput(text) {
    const raw = text.trim();
    if (!raw) return null;

    if (/op\.gg/i.test(raw)) {
        const parsed = parseOpgg(raw);

        if (!parsed) {
            rosterStatus('⚠️ Não reconheci esse link. Use o endereço do perfil, ex.: https://op.gg/lol/summoners/br/Nick-BR1');
        }

        return parsed;
    }

    if (raw.length > 30 || /[/\\]/.test(raw)) {
        rosterStatus('⚠️ Cole o link do op.gg ou digite só o nick (até 30 caracteres).');
        return null;
    }

    return { name: raw, url: null };
}

// ---------- Dados ----------
async function fetchRoster() {
    const [players, aliases] = await Promise.all([
        api('players?select=id,name,opgg_url&order=name.asc&limit=1000'),
        api('player_aliases?select=id,player_id,alias&order=alias.asc&limit=5000')
    ]);

    const byId = new Map(players.map(p => [p.id, { ...p, aliases: [] }]));

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

    buildIndexes();

    // Sugestões ao digitar nos campos do sorteio.
    $('playerSuggestions').replaceChildren(...roster.map(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        return opt;
    }));

    renderRoster();
}

// Mensagens começando com ⚠️ aparecem em destaque vermelho.
function rosterStatus(text) {
    const el = $('rosterStatus');
    el.textContent = text;
    el.classList.toggle('error', text.startsWith('⚠️'));
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
// A comparação ignora maiúsculas, acentos e espaços, e também olha os apelidos.
function nameFree(name, player) {
    const owner = findPlayer(name);

    if (owner && owner !== player) {
        rosterStatus(norm(owner.name) === norm(name) || searchKey(owner.name) === searchKey(name)
            ? `⚠️ ${owner.name} já está cadastrado.`
            : `⚠️ "${name}" já está cadastrado como apelido de ${owner.name}.`);
        return false;
    }

    return true;
}

// O mesmo perfil do op.gg não pode estar em dois jogadores.
function opggFree(url, player) {
    if (!url) return true;

    const owner = roster.find(p => p.opgg_url && p.opgg_url.toLowerCase() === url.toLowerCase());

    if (owner && owner !== player) {
        rosterStatus(`⚠️ Esse op.gg já está cadastrado no jogador ${owner.name}.`);
        return false;
    }

    return true;
}

// ---------- Lista (aba "Jogadores" do modo admin) ----------
function renderRoster() {
    const box = $('rosterList');
    box.replaceChildren();

    if (!adminSecret) return;

    if (!rosterLoaded) return;

    const q = searchKey($('rosterSearch').value);

    const shown = roster.filter(p =>
        !q || searchKey(p.name).includes(q) || p.aliases.some(a => searchKey(a.alias).includes(q))
    );

    if (!shown.length) {
        box.append(cell('p', roster.length
            ? 'Nenhum jogador encontrado.'
            : 'Nenhum jogador cadastrado ainda. Cole um link do op.gg acima.', 'none'));
        return;
    }

    for (const p of shown) box.append(rosterRow(p));
}

function opggLink(url, text, className) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = text;
    if (className) a.className = className;
    return a;
}

function rosterRow(p) {
    const row = document.createElement('div');
    row.className = 'roster-row';

    // Nick, link do op.gg e resumo do ranking.
    const s = playerStat(p.name);
    const info = document.createElement('div');
    info.className = 'roster-name';

    const title = document.createElement('b');
    title.title = p.name;

    if (p.opgg_url) {
        title.append(opggLink(p.opgg_url, p.name), opggLink(p.opgg_url, 'OP.GG', 'opgg'));
    } else {
        title.textContent = p.name;
    }

    const summary = s ? `${Math.round(s.rating)} · ${s.games} jogo${s.games === 1 ? '' : 's'}` : 'sem jogos';
    info.append(title, cell('small', summary + (p.opgg_url ? '' : ' · sem op.gg')));

    // Apelidos.
    const aliases = document.createElement('div');
    aliases.className = 'aliases';

    for (const a of p.aliases) {
        const chip = document.createElement('span');
        chip.className = 'alias';
        chip.title = 'Apelido: também é reconhecido no sorteio';

        const del = cell('button', '×');
        del.type = 'button';
        del.title = `Remover o apelido "${a.alias}"`;
        del.addEventListener('click', () => {
            rosterAction('remove_alias', { p_alias_id: a.id }, `🗑️ Apelido "${a.alias}" removido de ${p.name}.`);
        });

        chip.append(cell('span', a.alias), del);
        aliases.append(chip);
    }

    row.append(info, aliases);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'alias-input';
    input.maxLength = 30;
    input.placeholder = '+ apelido';
    input.title = 'Outro nome pelo qual este jogador é chamado. Digite e aperte Enter.';
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

    const edit = cell('button', '✏️', 'btn btn-ghost btn-sm');
    edit.type = 'button';
    edit.title = 'Trocar o link do op.gg ou o nick (o nick antigo vira apelido)';
    edit.addEventListener('click', () => editPlayer(p));

    const merge = cell('button', '🔀', 'btn btn-ghost btn-sm');
    merge.type = 'button';
    merge.title = 'Juntar com outro jogador (mesma pessoa cadastrada duas vezes)';
    merge.addEventListener('click', () => mergePlayer(p));

    actions.append(edit, merge);

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

    row.append(actions);

    return row;
}

// ---------- Ações ----------
function editPlayer(p) {
    const text = prompt(
        `Novo link do op.gg de "${p.name}" (ou só um novo nick).\n` +
        `Se o nick mudar, "${p.name}" continua valendo como apelido.`,
        p.opgg_url || p.name
    );

    if (text === null) return;

    const input = readPlayerInput(text);
    if (!input) return;

    const url = input.url || p.opgg_url;

    if (input.name === p.name && url === p.opgg_url) return;
    if (!nameFree(input.name, p) || !opggFree(url, p)) return;

    const msg = input.name === p.name
        ? `🔗 Link do op.gg de ${p.name} atualizado.`
        : `✏️ ${p.name} agora é ${input.name}.`;

    rosterAction('update_player', { p_player_id: p.id, p_new_name: input.name, p_opgg_url: url }, msg);
}

function mergePlayer(p) {
    const answer = (prompt(
        `"${p.name}" é a mesma pessoa que qual jogador?\n` +
        `Digite o nick de quem vai continuar. As partidas de "${p.name}" passam para ele ` +
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

    rosterAction('merge_players', { p_from: p.id, p_into: target.id }, `🔀 ${p.name} foi juntado em ${target.name}.`);
}

$('rosterAdd').addEventListener('submit', async e => {
    e.preventDefault();

    const input = readPlayerInput($('rosterNew').value);
    if (!input || !nameFree(input.name, null) || !opggFree(input.url, null)) return;

    const where = input.url ? ' com op.gg' : '';

    if (await rosterAction('add_player', { p_name: input.name, p_opgg_url: input.url }, `✅ ${input.name} cadastrado${where}.`)) {
        $('rosterNew').value = '';
        $('rosterNew').focus();
    }
});

$('rosterSearch').addEventListener('input', renderRoster);

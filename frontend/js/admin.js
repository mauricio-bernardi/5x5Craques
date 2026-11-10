// Modo admin: botão que pede a senha e libera o painel (partida manual e jogadores)
// e os botões de excluir partida. A senha fica só na memória (ver api.js).

function setAdminMode(on) {
    document.body.classList.toggle('admin', on);

    const btn = $('adminToggle');
    btn.setAttribute('aria-pressed', String(on));
    btn.title = on ? 'Painel admin' : 'Modo admin';

    if (on) {
        rosterStatus('');
        showStatus('manualStatus', '');
        if (!$('manualDate').value) $('manualDate').value = localDateTime(new Date());
        renderRoster();
    } else {
        closeDialog($('adminDrawer'));
    }
}

// Abre a gaveta de admin (pede a senha antes, se preciso) já na aba escolhida.
async function openAdmin(tab) {
    if (!adminSecret) {
        if (!backendOn()) {
            notify('⚠️ Configure o Supabase em js/config.js para usar o modo admin.');
            return;
        }

        try {
            if (!await requestAdmin()) return;
        } catch (err) {
            notify('⚠️ Não foi possível verificar a senha: ' + err.message);
            return;
        }
    }

    if (tab) selectAdminTab(tab);
    openDialog($('adminDrawer'));
}

$('adminToggle').addEventListener('click', () => openAdmin());

for (const btn of document.querySelectorAll('[data-admin-tab]')) {
    btn.addEventListener('click', () => openAdmin(btn.dataset.adminTab));
}

$('adminExit').addEventListener('click', () => {
    exitAdmin();
    notify('✅ Você saiu do modo admin.');
});

// Abas do painel.
function selectAdminTab(id) {
    for (const b of $('adminTabs').children) {
        b.classList.toggle('active', b.dataset.tab === id);
        $(b.dataset.tab).hidden = b.dataset.tab !== id;
    }
}

$('adminTabs').addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (btn) selectAdminTab(btn.dataset.tab);
});

// Mensagem num parágrafo de status; começando com ⚠️ aparece em vermelho.
function showStatus(id, text) {
    setLine(id, text);
}

// "2026-11-08T21:00" no fuso do navegador, para o campo datetime-local.
function localDateTime(d) {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// ---------- Partida manual ----------
for (const t of [1, 2]) {
    for (let i = 0; i < 5; i++) {
        const wrap = document.createElement('div');
        wrap.className = 'player-input';

        const input = document.createElement('input');
        input.type = 'text';
        input.id = `manual${t}_${i}`;
        input.maxLength = 30;
        input.placeholder = 'Jogador ' + (i + 1);
        input.autocomplete = 'off';
        input.setAttribute('list', 'playerSuggestions');

        // Ao sair do campo, nick escrito diferente ou apelido vira o nome oficial.
        input.addEventListener('change', () => {
            if (input.value.trim()) input.value = canonicalName(input.value);
        });

        const num = document.createElement('span');
        num.textContent = i + 1;

        wrap.append(num, input);
        $('manualTeam' + t).append(wrap);
    }
}

function manualTeam(t) {
    return Array.from({ length: 5 }, (_, i) => $(`manual${t}_${i}`).value.trim());
}

$('manualFromDraw').addEventListener('click', () => {
    if (!playerTeams) {
        showStatus('manualStatus', '⚠️ Nenhum time sorteado ainda. Sorteie na aba Partida ou preencha à mão.');
        return;
    }

    playerTeams.forEach((team, t) => team.forEach((name, i) => {
        $(`manual${t + 1}_${i}`).value = name;
    }));

    showStatus('manualStatus', 'Times copiados do sorteio. Escolha o vencedor e registre.');
});

$('tabMatch').addEventListener('submit', async e => {
    e.preventDefault();

    const raw = [manualTeam(1), manualTeam(2)];
    const missing = raw.flat().filter(n => !n).length;

    if (missing) {
        showStatus('manualStatus', `⚠️ Preencha os 10 jogadores (faltam ${missing}).`);
        return;
    }

    const teams = raw.map(team => team.map(canonicalName));

    // Mesmo jogador duas vezes (inclusive por apelido).
    const seen = new Map();
    for (const name of teams.flat()) {
        const k = norm(name);
        if (seen.has(k)) {
            showStatus('manualStatus', `⚠️ ${name} aparece duas vezes.`);
            return;
        }
        seen.set(k, true);
    }

    const winner = Number($('manualWinner').value);

    if (!winner) {
        showStatus('manualStatus', '⚠️ Escolha quem venceu.');
        return;
    }

    const when = $('manualDate').value ? new Date($('manualDate').value) : new Date();

    if (isNaN(when) || when > new Date(Date.now() + 3600000)) {
        showStatus('manualStatus', '⚠️ Data inválida ou no futuro.');
        return;
    }

    const unknown = rosterLoaded ? teams.flat().filter(n => !findPlayer(n)) : [];
    const date = when.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

    if (!await ask({
        title: `Registrar partida de ${date}?`,
        text: confirmBody([teamsPreview(teams, winner, ['Time azul', 'Time vermelho']), unknownNote(unknown)]),
        ok: 'Registrar partida'
    })) {
        return;
    }

    try {
        await rpc('register_match', {
            p_team1: teams[0],
            p_team2: teams[1],
            p_winner: winner,
            p_played_at: when.toISOString()
        });

        for (const t of [1, 2]) for (let i = 0; i < 5; i++) $(`manual${t}_${i}`).value = '';
        $('manualWinner').value = '';

        showStatus('manualStatus', `Partida de ${date} registrada.`);
        notify(`✅ Partida de ${date} registrada.`);
        await refreshRanking();
    } catch (err) {
        showStatus('manualStatus', '⚠️ Não foi possível registrar: ' + err.message);
    }
});

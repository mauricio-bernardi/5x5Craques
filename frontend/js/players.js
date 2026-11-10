// Sorteio/balanceamento de jogadores e registro do resultado da partida.

// ---------- Sorteio de jogadores ----------
let playerTeams = null;
let spinning = false;
let matchSaved = false;
let savingMatch = false;

for (let i = 0; i < 10; i++) {
    const wrap = document.createElement('div');
    wrap.className = 'player-input';

    const num = document.createElement('span');
    num.textContent = i + 1;

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'player' + i;
    input.maxLength = 30;
    input.placeholder = 'Jogador ' + (i + 1);
    input.autocomplete = 'off';
    input.setAttribute('list', 'playerSuggestions');
    input.addEventListener('input', () => {
        save();
        updatePlayersCount();
    });

    // Ao sair do campo, um apelido conhecido vira o nome oficial.
    input.addEventListener('change', () => {
        const official = canonicalName(input.value);

        if (input.value.trim() && official !== input.value) {
            input.value = official;
            save();
        }
    });
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            const next = $('player' + (i + 1));
            if (next) next.focus(); else $('drawPlayers').click();
        }
    });

    wrap.append(num, input);
    $('playerInputs').append(wrap);
}

// Painel dos 10 nomes: recolhe depois do sorteio para o tabuleiro ganhar espaço.
function setPlayersOpen(open) {
    $('playersPanel').dataset.open = String(open);
    $('playersToggle').setAttribute('aria-expanded', String(open));
}

$('playersToggle').addEventListener('click', () => {
    const open = $('playersPanel').dataset.open !== 'true';
    setPlayersOpen(open);
    if (open) {
        const empty = playerNames().findIndex(n => !n);
        $('player' + (empty < 0 ? 0 : empty)).focus({ preventScroll: true });
    }
});

function updatePlayersCount() {
    const n = playerNames().filter(Boolean).length;
    $('playersCount').textContent = `${n}/10`;
    $('playersCount').classList.toggle('full', n === 10);
}

function playerNames() {
    return Array.from({ length: 10 }, (_, i) => $('player' + i).value.trim());
}

function teamTitle(i) {
    return $('team' + (i + 1)).value.trim() || 'Time ' + (i + 1);
}

function fillPlayerLists(teams) {
    for (let t = 0; t < 2; t++) {
        const ol = $('pteamList' + (t + 1));
        ol.replaceChildren();

        for (const name of teams[t]) {
            const li = document.createElement('li');
            const label = document.createElement('span');
            label.textContent = name;
            li.append(label);

            if (backendOn()) {
                const s = playerStat(name);
                const small = document.createElement('small');
                small.textContent = s ? Math.round(s.rating) : 'novo';
                li.append(small);
            }

            ol.append(li);
        }
    }
}

function teamAvg(team) {
    return team.reduce((s, n) => s + ratingOf(n), 0) / team.length;
}

function updateResultButtons() {
    const board = $('board');

    board.classList.toggle('has-teams', !!playerTeams);
    board.classList.toggle('saved', !!playerTeams && matchSaved);
    board.classList.toggle('no-backend', !backendOn());

    for (let t = 0; t < 2; t++) {
        const btn = $('win' + (t + 1));

        btn.title = matchSaved
            ? 'Resultado já registrado'
            : `Registrar vitória de ${teamTitle(t)} no ranking`;
        btn.disabled = !playerTeams || spinning || matchSaved || savingMatch || !backendOn();
    }

    const info = $('balanceInfo');

    if (!backendOn() || !playerTeams || spinning) {
        info.textContent = '';
    } else {
        const a = Math.round(teamAvg(playerTeams[0]));
        const b = Math.round(teamAvg(playerTeams[1]));

        info.textContent = matchSaved ? 'registrado' : `${a} – ${b}`;
        info.title = matchSaved ? 'Resultado já registrado no ranking' : 'Rating médio de cada time';
    }
}

function showPlayerTeams(animate) {
    const box = $('board');
    box.classList.remove('done');

    fillPlayerLists(playerTeams);
    updateResultButtons();

    if (animate) {
        void box.offsetWidth;
        box.classList.add('done');
    }
}

// Lê e valida os 10 nomes; devolve null (e mostra o aviso) se algo estiver errado.
function readPlayers() {
    const filled = playerNames().filter(Boolean);

    if (filled.length !== 10) {
        notify(`⚠️ Preencha os 10 jogadores (faltam ${10 - filled.length}).`);
        return null;
    }

    // Troca apelidos pelo nome oficial (também nos campos, para ficar visível).
    const official = filled.map(canonicalName);

    for (let i = 0; i < 10; i++) {
        const input = $('player' + i);
        if (input.value.trim()) input.value = canonicalName(input.value);
    }

    save();

    const seen = new Map();
    for (let i = 0; i < official.length; i++) {
        const k = norm(official[i]);

        if (seen.has(k)) {
            const first = filled[seen.get(k)];
            notify(norm(first) === norm(filled[i])
                ? `⚠️ O nome "${filled[i]}" está repetido.`
                : `⚠️ "${first}" e "${filled[i]}" são o mesmo jogador (${official[i]}).`);
            return null;
        }

        seen.set(k, i);
    }

    return official;
}

$('drawPlayers').addEventListener('click', () => {
    if (spinning) return;

    const filled = readPlayers();
    if (!filled) return;

    const final = shuffle(filled);
    revealTeams(filled, [final.slice(0, 5), final.slice(5)], '🎰 Jogadores sorteados!');
});

$('balancePlayers').addEventListener('click', () => {
    if (spinning) return;

    const filled = readPlayers();
    if (!filled) return;

    const msg = backendOn() && stats.size
        ? '⚖️ Times balanceados pelo rating!'
        : '⚖️ Ainda não há ranking: todos contam como ' + DEFAULT_RATING + ', então a divisão saiu aleatória.';

    revealTeams(filled, balancedSplit(filled), msg);
});

function revealTeams(filled, teams, doneMsg) {
    playerTeams = teams;
    matchSaved = false;

    // Efeito de roleta: embaralha os nomes por alguns instantes antes do resultado.
    spinning = true;
    updateResultButtons();
    setPlayersOpen(false);
    $('board').classList.remove('done');
    $('board').classList.add('spinning');

    let ticks = 0;
    const total = 18;

    const spin = () => {
        const s = shuffle(filled);
        fillPlayerLists([s.slice(0, 5), s.slice(5)]);
        ticks++;

        if (ticks < total) {
            setTimeout(spin, 50 + ticks * 8);
        } else {
            $('board').classList.remove('spinning');
            spinning = false;
            showPlayerTeams(true);
            save();
            notify(doneMsg);
        }
    };

    spin();
}

async function registerResult(winner) {
    if (!playerTeams || spinning || matchSaved || savingMatch || !backendOn()) return;

    const name = teamTitle(winner - 1);

    // Nomes que o banco não conhece viram jogadores novos: avisa para pegar nick escrito errado.
    const unknown = rosterLoaded ? playerTeams.flat().filter(n => !findPlayer(n)) : [];

    if (!await ask({
        title: `Vitória de ${name}?`,
        text: confirmBody([teamsPreview(playerTeams, winner), unknownNote(unknown)]),
        ok: 'Registrar vitória'
    })) {
        return;
    }

    savingMatch = true;
    updateResultButtons();

    try {
        await rpc('register_match', {
            p_team1: playerTeams[0],
            p_team2: playerTeams[1],
            p_winner: winner
        });

        matchSaved = true;
        save();
        notify(`🏆 Vitória de "${name}" registrada no ranking!`);

        await refreshRanking();
    } catch (err) {
        notify('⚠️ Não foi possível registrar: ' + err.message);
    } finally {
        savingMatch = false;
        updateResultButtons();
    }
}

$('win1').addEventListener('click', () => registerResult(1));
$('win2').addEventListener('click', () => registerResult(2));

$('clearPlayers').addEventListener('click', () => {
    for (let i = 0; i < 10; i++) $('player' + i).value = '';

    playerTeams = null;
    matchSaved = false;
    $('pteamList1').replaceChildren();
    $('pteamList2').replaceChildren();
    updateResultButtons();
    updatePlayersCount();
    setPlayersOpen(true);
    save();
    $('player0').focus();
});

// Tabela de ranking e histórico de partidas.

// ---------- Ranking ----------
function cell(tag, text, className) {
    const el = document.createElement(tag);
    el.textContent = text;
    if (className) el.className = className;
    return el;
}

function renderRanking() {
    const body = $('rankBody');
    body.replaceChildren();

    const ranked = [...stats.values()].sort((a, b) => b.rating - a.rating || b.games - a.games);

    // Cadastrados que ainda não jogaram entram no fim, sem posição.
    const newcomers = roster
        .filter(p => !stats.has(norm(p.name)))
        .map(p => ({ name: p.name, rating: DEFAULT_RATING, games: 0, wins: 0 }));

    const rows = [...ranked, ...newcomers];

    if (!rows.length) {
        const tr = document.createElement('tr');
        tr.className = 'none-row';

        const td = cell('td', 'Nenhum jogador ainda. Sorteie os times e registre o vencedor.');
        td.colSpan = 7;

        tr.append(td);
        body.append(tr);
    }

    rows.forEach((p, i) => {
        const tr = document.createElement('tr');
        const played = p.games > 0;

        if (!played) {
            tr.className = 'few';
            tr.title = 'Ainda não jogou';
        } else if (p.games < MIN_GAMES) {
            tr.className = 'few';
            tr.title = `Menos de ${MIN_GAMES} jogos: rating ainda pouco confiável`;
        }

        // Nome vira link para o op.gg, se o jogador tiver um cadastrado.
        const who = findPlayer(p.name);
        const nameCell = document.createElement('td');

        if (who && who.opgg_url) {
            nameCell.append(opggLink(who.opgg_url, p.name, 'player-link'));
        } else {
            nameCell.textContent = p.name;
        }

        tr.append(
            played ? cell('td', i + 1, 'pos') : cell('td', '–', 'pos new'),
            nameCell,
            cell('td', Math.round(p.rating), 'num rating'),
            cell('td', p.games, 'num'),
            cell('td', p.wins, 'num'),
            cell('td', p.games - p.wins, 'num'),
            cell('td', played ? Math.round(100 * p.wins / p.games) + '%' : '–', 'num')
        );

        body.append(tr);
    });

    // Últimas 10 partidas, da mais recente para a mais antiga.
    const list = $('history');
    list.replaceChildren();

    const recent = history.slice(-10).reverse();

    if (!recent.length) {
        list.append(cell('p', 'Nenhuma partida ainda.', 'sub'));
    }

    for (const m of recent) {
        const row = document.createElement('div');
        row.className = 'match-row';

        const when = new Date(m.played_at);
        const date = when.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

        const time = cell('time', when.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), 'date');
        time.dateTime = m.played_at;
        time.title = date;

        const teams = document.createElement('div');
        teams.className = 'teams';

        [m.team1, m.team2].forEach((team, t) => {
            const won = m.winner === t + 1;
            const side = cell('div', (team || []).join(', '), 'mside ' + (t ? 'red' : 'blue') + (won ? ' won' : ''));

            if (won) {
                side.prepend(icon('trophy'));
                side.title = 'Venceu';
            }

            teams.append(side);
        });

        const del = iconButton('trash', 'Excluir esta partida', 'admin-only danger');
        del.addEventListener('click', () => deleteMatch(m, date));

        row.append(time, teams, del);
        list.append(row);
    }
}

async function deleteMatch(m, date) {
    if (!await ask({
        title: 'Excluir partida?',
        text: confirmBody([`Partida de ${date}. O ranking será recalculado.`, teamsPreview([m.team1 || [], m.team2 || []], m.winner, ['Time azul', 'Time vermelho'])]),
        ok: 'Excluir',
        danger: true
    })) return;

    try {
        await rpc('delete_match', { p_id: m.id });
        notify('🗑️ Partida excluída.');
        await refreshRanking();
    } catch (err) {
        notify('⚠️ Não foi possível excluir: ' + err.message);
    }
}

async function refreshRanking() {
    if (!backendOn()) {
        $('rankInfo').textContent = 'Ranking desligado: preencha SUPABASE_URL e SUPABASE_KEY em js/config.js.';
        renderRanking();
        await refreshRoster();
        updateResultButtons();
        return;
    }

    $('rankInfo').textContent = 'Carregando...';

    // A lista de jogadores carrega junto, mas um erro nela não impede o ranking.
    const rosterDone = refreshRoster();

    try {
        history = await fetchMatches();
        await rosterDone;
        stats = computeStats(history);

        $('rankInfo').textContent = `${history.length} ${history.length === 1 ? 'partida' : 'partidas'}`;
        $('rankNote').textContent =
            `Todos começam com ${DEFAULT_RATING}. Em cinza: menos de ${MIN_GAMES} jogos.`;
    } catch (err) {
        $('rankInfo').textContent = 'Não foi possível carregar: ' + err.message;
    }

    renderRanking();
    renderRoster(); // de novo, agora com o rating atualizado de cada jogador

    if (playerTeams && !spinning) {
        fillPlayerLists(playerTeams);
        updateResultButtons();
    }
}

$('refreshRank').addEventListener('click', async () => {
    const btn = $('refreshRank');
    btn.classList.add('spin');
    await refreshRanking();
    btn.classList.remove('spin');
});

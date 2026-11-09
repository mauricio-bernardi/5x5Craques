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

    const rows = [...stats.values()].sort((a, b) => b.rating - a.rating || b.games - a.games);

    if (!rows.length) {
        const tr = document.createElement('tr');
        tr.className = 'none-row';

        const td = cell('td', 'Nenhuma partida registrada ainda.');
        td.colSpan = 7;

        tr.append(td);
        body.append(tr);
    }

    rows.forEach((p, i) => {
        const tr = document.createElement('tr');

        if (p.games < MIN_GAMES) {
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
            cell('td', i + 1, 'pos'),
            nameCell,
            cell('td', Math.round(p.rating), 'num rating'),
            cell('td', p.games, 'num'),
            cell('td', p.wins, 'num'),
            cell('td', p.games - p.wins, 'num'),
            cell('td', Math.round(100 * p.wins / p.games) + '%', 'num')
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

        const date = new Date(m.played_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

        const teams = document.createElement('div');
        teams.className = 'teams';

        [m.team1, m.team2].forEach((team, t) => {
            const won = m.winner === t + 1;
            const side = cell('div', `${t ? '🔴' : '🔵'} ${(team || []).join(', ')}${won ? '  🏆' : ''}`, 'side' + (won ? ' win' : ''));
            teams.append(side);
        });

        const del = cell('button', 'Excluir', 'btn btn-danger');
        del.type = 'button';
        del.title = 'Excluir esta partida (registrada por engano)';
        del.addEventListener('click', () => deleteMatch(m, date));

        row.append(cell('span', date, 'date'), teams, del);
        list.append(row);
    }
}

async function deleteMatch(m, date) {
    if (!confirm(`Excluir a partida de ${date}? O ranking será recalculado.`)) return;

    try {
        await rpc('delete_match', { p_id: m.id });
        $('status').textContent = '🗑️ Partida excluída.';
        await refreshRanking();
    } catch (err) {
        $('status').textContent = '⚠️ Não foi possível excluir: ' + err.message;
    }
}

async function refreshRanking() {
    if (!backendOn()) {
        $('rankInfo').textContent = '⚠️ Backend não configurado: preencha SUPABASE_URL e SUPABASE_KEY no código da página.';
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

        $('rankInfo').textContent =
            `${history.length} partida(s) registrada(s). Todo mundo começa com ${DEFAULT_RATING}; ` +
            `quem tem menos de ${MIN_GAMES} jogos aparece apagado.`;
    } catch (err) {
        $('rankInfo').textContent = '⚠️ Não foi possível carregar o ranking: ' + err.message;
    }

    renderRanking();
    renderRoster(); // de novo, agora com o rating atualizado de cada jogador

    if (playerTeams && !spinning) {
        fillPlayerLists(playerTeams);
        updateResultButtons();
    }
}

$('refreshRank').addEventListener('click', refreshRanking);

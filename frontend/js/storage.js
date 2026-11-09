// Salva e restaura o estado da página no navegador (localStorage).

const storageKey = 'roleta_lol_v2';

function save() {
    try {
        localStorage.setItem(storageKey, JSON.stringify({
            team1: $('team1').value,
            team2: $('team2').value,
            blocked: [...blocked.values()],
            players: playerNames(),
            playerTeams,
            matchSaved
        }));
    } catch (e) {}
}

function load() {
    try {
        const data = JSON.parse(localStorage.getItem(storageKey) || '{}');

        for (const id of ['team1', 'team2']) {
            if (typeof data[id] === 'string') {
                $(id).value = data[id];
            }
        }

        if (Array.isArray(data.players)) {
            data.players.slice(0, 10).forEach((n, i) => {
                if (typeof n === 'string') $('player' + i).value = n;
            });
        }

        if (Array.isArray(data.playerTeams) && data.playerTeams.length === 2) {
            playerTeams = data.playerTeams;
            matchSaved = data.matchSaved === true;
            showPlayerTeams(false);
        }

        let names = [];

        if (Array.isArray(data.blocked)) {
            names = data.blocked;
        } else if (typeof data.excluded === 'string') {
            // Migra o formato antigo (texto livre).
            names = data.excluded.split(/[,;\n\r]+/);
        }

        for (const n of names) {
            if (typeof n === 'string' && n.trim()) {
                blocked.set(norm(n), n.trim());
            }
        }
    } catch (e) {}

    renderPools();
}

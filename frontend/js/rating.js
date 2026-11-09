// Cálculo do rating (Elo) e balanceamento dos times.

// ---------- Rating (Elo por time) ----------
// Recalculado a partir de todo o histórico, em ordem cronológica.
// Cada time "joga" com a média de rating dos seus 5 jogadores: ganhar de um time
// mais forte vale mais pontos, perder para um mais fraco custa mais.
let history = [];
let stats = new Map(); // nome normalizado -> { name, rating, games, wins }

function computeStats(matches) {
    const map = new Map();

    const get = name => {
        const k = norm(name);

        if (!map.has(k)) map.set(k, { name, rating: DEFAULT_RATING, games: 0, wins: 0 });

        return map.get(k);
    };

    const avg = team => team.reduce((s, p) => s + p.rating, 0) / team.length;

    for (const m of matches) {
        const t1 = (m.team1 || []).map(get);
        const t2 = (m.team2 || []).map(get);

        if (!t1.length || !t2.length) continue;

        const e1 = 1 / (1 + 10 ** ((avg(t2) - avg(t1)) / 400));
        const s1 = m.winner === 1 ? 1 : 0;

        for (const [team, score, expected] of [[t1, s1, e1], [t2, 1 - s1, 1 - e1]]) {
            for (const p of team) {
                // Jogadores novos se movem mais rápido até o rating se estabilizar.
                const k = p.games < 10 ? 40 : 24;

                p.rating += k * (score - expected);
                p.games++;
                if (score) p.wins++;
            }
        }
    }

    return map;
}

function playerStat(name) {
    return stats.get(norm(name)) || null;
}

function ratingOf(name) {
    const s = playerStat(name);
    return s ? s.rating : DEFAULT_RATING;
}

// Testa as 126 divisões possíveis de 10 jogadores em 5x5 e sorteia entre as mais equilibradas.
function balancedSplit(names) {
    const r = names.map(ratingOf);
    const total = r.reduce((a, b) => a + b, 0);
    const options = [];

    // O jogador 0 fica sempre no time A, para não contar a mesma divisão duas vezes.
    for (let mask = 1; mask < 1 << names.length; mask += 2) {
        let count = 0;
        let sum = 0;

        for (let i = 0; i < names.length; i++) {
            if (mask >> i & 1) { count++; sum += r[i]; }
        }

        if (count === 5) options.push({ mask, diff: Math.abs(2 * sum - total) });
    }

    // Embaralha antes de ordenar: em caso de empate (ex.: todos novos) a escolha fica aleatória.
    const sorted = shuffle(options).sort((a, b) => a.diff - b.diff);
    const best = sorted[0].diff;

    // Até 5 opções boas, com no máximo 40 pontos de soma (8 por jogador) a mais que a melhor.
    const pool = sorted.filter(o => o.diff <= best + 40).slice(0, 5);
    const pick = pool[Math.floor(Math.random() * pool.length)];

    const a = [];
    const b = [];

    names.forEach((n, i) => (pick.mask >> i & 1 ? a : b).push(n));

    return Math.random() < .5 ? [a, b] : [b, a];
}

// Areninha: ranking das partidas de Arena, importadas da API da Riot pelo robô
// (scripts/arena-sync.mjs, a cada 15 min). Aqui só se lê o que está no banco.

const ARENA_START_LABEL = '01/11';
const ARENA_RECENT = 15;

let arenaLoadedAt = 0;
let arenaLoading = false;

// Elo pelos pontos. Desafiante: só os 3 primeiros do ranking, e só se já forem Grão-Mestre.
const ELOS = [
    { min: 800, name: 'Grão-Mestre', cls: 'gm' },
    { min: 700, name: 'Mestre', cls: 'master' },
    { min: 600, name: 'Diamante', cls: 'diamond' },
    { min: 500, name: 'Esmeralda', cls: 'emerald' },
    { min: 400, name: 'Platina', cls: 'plat' },
    { min: 300, name: 'Ouro', cls: 'gold' },
    { min: 200, name: 'Prata', cls: 'silver' },
    { min: 100, name: 'Bronze', cls: 'bronze' },
    { min: -Infinity, name: 'Ferro', cls: 'iron' }
];
const CHALLENGER = { name: 'Desafiante', cls: 'chall' };
const CHALLENGER_SLOTS = 3;

// pos: posição no ranking (0 = primeiro), entre quem já jogou.
function eloOf(points, pos) {
    const elo = ELOS.find(e => points >= e.min);
    return elo.cls === 'gm' && pos < CHALLENGER_SLOTS ? CHALLENGER : elo;
}

function eloTag(elo) {
    const tag = cell('span', elo.name, 'elo elo-' + elo.cls);
    tag.title = 'Elo na Areninha';
    return tag;
}

const ordinal = n => n + 'º';
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);

async function fetchArena() {
    const [ranking, games] = await Promise.all([
        api('arena_ranking?select=*'),
        api(`arena_history?select=*&order=played_at.desc&limit=${ARENA_RECENT}`)
    ]);

    return { ranking, games };
}

async function refreshArena() {
    if (arenaLoading) return;

    if (!backendOn()) {
        $('arenaInfo').textContent = 'Desligado: preencha SUPABASE_URL e SUPABASE_KEY em js/config.js.';
        return;
    }

    arenaLoading = true;
    $('refreshArena').classList.add('spin');

    try {
        const { ranking, games } = await fetchArena();
        renderArena(ranking, games);
        arenaLoadedAt = Date.now();
    } catch (err) {
        $('arenaInfo').textContent = /arena_/.test(err.message)
            ? 'A Areninha ainda não foi ativada no banco (rode o schema.sql atualizado).'
            : 'Não foi possível carregar: ' + err.message;
    } finally {
        arenaLoading = false;
        $('refreshArena').classList.remove('spin');
    }
}

function renderArena(ranking, games) {
    const total = ranking.reduce((s, p) => s + p.games, 0);
    const played = ranking.filter(p => p.games > 0)
        .sort((a, b) => b.points - a.points || a.avg_placement - b.avg_placement || b.games - a.games);
    const rest = ranking.filter(p => p.games === 0).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    $('arenaInfo').textContent = played.length
        ? `${played.length} ${played.length === 1 ? 'jogador' : 'jogadores'} desde ${ARENA_START_LABEL}`
        : `Nenhuma Arena desde ${ARENA_START_LABEL}`;

    // Corte do Desafiante: os pontos do 3º colocado (se ele já for Grão-Mestre).
    const third = played[CHALLENGER_SLOTS - 1];
    const cut = third && third.points >= 800 ? third.points : 800;

    $('arenaNote').textContent =
        'Todos começam com 0. 1º +30 · 2º +20 · 3º +10 · 4º −10 · 5º −20 · 6º −30. Atualiza sozinho a cada 15 min. ' +
        'Elo: Ferro abaixo de 100 · Bronze 100 · Prata 200 · Ouro 300 · Platina 400 · Esmeralda 500 · ' +
        `Diamante 600 · Mestre 700 · Grão-Mestre 800 · Desafiante: só os 3 primeiros com ${cut}+ (corte atual).`;

    // ---------- Tabela ----------
    const body = $('arenaBody');
    body.replaceChildren();

    if (!total && !rest.length) {
        const tr = document.createElement('tr');
        tr.className = 'none-row';
        const td = cell('td', 'Nenhum jogador cadastrado.');
        td.colSpan = 7;
        tr.append(td);
        body.append(tr);
    }

    [...played, ...rest].forEach((p, i) => {
        const tr = document.createElement('tr');
        const has = p.games > 0;

        if (!has) {
            tr.className = 'few';
            tr.title = 'Nenhuma Arena ainda';
        }

        const nameCell = document.createElement('td');
        if (p.opgg_url) nameCell.append(opggLink(p.opgg_url, p.name, 'player-link'));
        else nameCell.textContent = p.name;
        if (has) nameCell.append(eloTag(eloOf(p.points, i)));

        const last = cell('td', has ? ordinal(p.last_placement) : '–', 'num');
        if (has) last.append(placeDot(p.last_placement));

        tr.append(
            has ? cell('td', i + 1, 'pos') : cell('td', '–', 'pos new'),
            nameCell,
            cell('td', signed(p.points), 'num rating'),
            cell('td', p.games, 'num'),
            cell('td', has ? p.firsts : '–', 'num'),
            cell('td', has ? Number(p.avg_placement).toFixed(1) : '–', 'num'),
            last
        );

        body.append(tr);
    });

    // ---------- Últimas Arenas ----------
    const list = $('arenaHistory');
    list.replaceChildren();

    if (!games.length) {
        list.append(cell('p', 'As Arenas aparecem aqui alguns minutos depois de terminar.', 'sub'));
    }

    for (const g of games) list.append(arenaRow(g));
}

// Bolinha de cor pela colocação: 1º-3º ganham pontos, 4º-6º perdem.
function placeDot(placement) {
    const dot = document.createElement('span');
    dot.className = 'place-dot ' + (placement <= 3 ? 'up' : 'down');
    return dot;
}

function arenaRow(g) {
    const row = document.createElement('div');
    row.className = 'match-row arena-row' + (g.counted ? '' : ' off');

    const when = new Date(g.played_at);
    const time = cell('time', when.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), 'date');
    time.dateTime = g.played_at;
    time.title = when.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) +
        (g.duration_s ? ` · ${Math.round(g.duration_s / 60)} min` : '');

    const lines = document.createElement('div');
    lines.className = 'arena-players';

    for (const p of g.players) {
        const line = document.createElement('div');
        line.className = 'arena-line';

        const place = cell('span', ordinal(p.placement), 'place ' + (p.placement === 1 ? 'first' : p.placement <= 3 ? 'up' : 'down'));
        const pic = p.champion ? portrait(p.champion) : document.createElement('span');
        if (p.champion) pic.title = p.champion;

        const pts = cell('span', g.counted ? signed(p.points) : '0', 'pts ' + (p.points > 0 ? 'up' : 'down'));

        line.append(place, pic, cell('span', p.name, 'who'), pts);
        lines.append(line);
    }

    if (!g.counted) lines.append(cell('span', 'Não conta', 'off-tag'));

    // Admin: tirar a partida da conta (ou devolver).
    const toggle = iconButton(g.counted ? 'ban' : 'undo', g.counted ? 'Não contar esta Arena' : 'Voltar a contar esta Arena', 'admin-only' + (g.counted ? ' danger' : ''));
    toggle.addEventListener('click', () => toggleArenaGame(g));

    row.append(time, lines, toggle);
    return row;
}

async function toggleArenaGame(g) {
    const date = new Date(g.played_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

    if (g.counted && !await ask({
        title: 'Não contar esta Arena?',
        text: `Arena de ${date}. Os pontos dela saem do ranking (dá para voltar depois).`,
        ok: 'Não contar',
        danger: true
    })) return;

    try {
        await rpc('arena_set_counted', { p_match_id: g.match_id, p_counted: !g.counted });
        notify(g.counted ? 'Arena tirada da conta.' : 'Arena voltou a contar.');
        await refreshArena();
    } catch (err) {
        notify('⚠️ Não foi possível alterar: ' + err.message);
    }
}

$('refreshArena').addEventListener('click', refreshArena);

// Carrega ao abrir a aba (e de novo se os dados tiverem mais de 2 minutos).
document.addEventListener('viewchange', e => {
    if (e.detail === 'arena' && Date.now() - arenaLoadedAt > 120000) refreshArena();
});

if (!$('view-arena').hidden) refreshArena();

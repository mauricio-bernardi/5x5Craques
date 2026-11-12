// Resenhômetro: escolhe 3 jogadores e mede de 1 a 100 a "resenha" do trio na Arena,
// pelas colocações das Arenas que jogaram juntos (o robô importa as últimas 100 de cada um).
// Quanto pior o trio vai, mais resenha: 100 = só toma pau junto, 1 = tryhard que só ganha.
//
// Conta, do mais forte para o mais fraco:
//   - Arenas dos três no mesmo time (peso 1)
//   - Arenas de duas pessoas do trio no mesmo time (peso 0,5)
//   - a fase de cada um sozinho, que é o ponto de partida quando eles quase não jogaram juntos.

const RESENHA_HISTORY = 100;   // últimas Arenas de cada jogador
const RESENHA_PRIOR = 4;       // quantas Arenas juntos valem o "ponto de partida"
const PAIR_WEIGHT = 0.5;
const RESENHA_KEY = 'resenhaTrio';
const TOP_MIN_TOGETHER = 3;    // trios com menos Arenas juntos que isso não entram no top
const TOP_SIZE = 5;

const RESENHA_TIERS = [
    { max: 20, label: 'Tryhard total' },
    { max: 40, label: 'Sério demais' },
    { max: 60, label: 'Morna' },
    { max: 80, label: 'Resenha boa' },
    { max: 100, label: 'Resenha lendária' }
];
const GAUGE_COLORS = ['#e26a5e', '#db8e64', '#d4b26a', '#b0bd82', '#8cc79a'];

const resenhaCache = new Map();
let allTeams = null;           // todas as linhas de arena_teams (para o top de trios)
let resenhaToken = 0;
let shownScore = 0;

// Colocação -> 0 a 1 (1º = 1, 6º = 0).
const placeValue = p => Math.min(1, Math.max(0, (6 - p) / 5));
const avgPlace = list => list.reduce((s, r) => s + r.placement, 0) / list.length;

// ---------- Velocímetro ----------
function buildGauge() {
    const svg = $('gauge');
    const NS = 'http://www.w3.org/2000/svg';
    const cx = 110, cy = 110, r = 88;
    const pt = a => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy - r * Math.sin(a)).toFixed(2)}`;
    const gap = 0.025;

    GAUGE_COLORS.forEach((color, i) => {
        const a1 = Math.PI - i * Math.PI / 5 - gap;
        const a2 = Math.PI - (i + 1) * Math.PI / 5 + gap;
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', `M ${pt(a1)} A ${r} ${r} 0 0 1 ${pt(a2)}`);
        path.setAttribute('class', 'seg');
        path.style.stroke = color;
        svg.insertBefore(path, $('needle'));
    });
}

function setGauge(score) {
    const segs = $('gauge').querySelectorAll('.seg');
    const angle = score == null ? -90 : -90 + 180 * (score - 1) / 99;

    $('needle').style.transform = `rotate(${angle}deg)`;
    segs.forEach((s, i) => s.classList.toggle('lit', score != null && score > i * 20));

    const tier = score == null ? null : RESENHA_TIERS.find(t => score <= t.max);
    $('resenhaLabel').textContent = tier ? tier.label : '';
    $('resenhaLabel').style.color = tier ? GAUGE_COLORS[RESENHA_TIERS.indexOf(tier)] : '';

    // Número sobe junto com o ponteiro.
    const out = $('resenhaScore');
    if (score == null) {
        out.textContent = '–';
        shownScore = 0;
        return;
    }

    const from = shownScore, start = performance.now(), dur = 900;
    shownScore = score;

    const step = now => {
        if (shownScore !== score) return;
        const t = Math.min(1, (now - start) / dur);
        out.textContent = Math.round(from + (score - from) * (1 - Math.pow(1 - t, 3)));
        if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    // Garante o número final mesmo se a animação não rodar (aba em segundo plano).
    setTimeout(() => { if (shownScore === score) out.textContent = score; }, dur + 100);
}

// ---------- Escolha do trio ----------
function trioIds() {
    return [0, 1, 2].map(i => Number($('trio' + i).value)).filter(Boolean);
}

function fillTrioSelects() {
    const saved = (() => {
        try { return JSON.parse(localStorage.getItem(RESENHA_KEY)) || []; } catch (e) { return []; }
    })();

    for (let i = 0; i < 3; i++) {
        const sel = $('trio' + i);
        const keep = Number(sel.value) || saved[i];

        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = 'Jogador ' + (i + 1);

        sel.replaceChildren(blank, ...roster.map(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            return opt;
        }));

        if (roster.some(p => p.id === keep)) sel.value = keep;
    }

    syncTrioSelects();
}

// Quem já está num campo não aparece como opção nos outros.
function syncTrioSelects() {
    const ids = [0, 1, 2].map(i => Number($('trio' + i).value));

    for (let i = 0; i < 3; i++) {
        for (const opt of $('trio' + i).options) {
            opt.disabled = !!opt.value && ids.some((id, j) => j !== i && id === Number(opt.value));
        }
    }

    try { localStorage.setItem(RESENHA_KEY, JSON.stringify(ids)); } catch (e) { /* sem armazenamento */ }

    measureTrio();
}

function shuffleTrio() {
    if (roster.length < 3) return;

    shuffle(roster).slice(0, 3).forEach((p, i) => { $('trio' + i).value = p.id; });
    syncTrioSelects();
}

// ---------- Cálculo ----------
async function fetchTeams(ids) {
    const key = [...ids].sort((a, b) => a - b).join(',');

    if (!resenhaCache.has(key)) {
        resenhaCache.set(key, api('arena_teams?select=match_id,played_at,placement,players' +
            `&players=ov.${encodeURIComponent('{' + key + '}')}&order=played_at.desc&limit=1000`)
            .catch(err => { resenhaCache.delete(key); throw err; }));
    }

    return resenhaCache.get(key);
}

function scoreTrio(ids, rows) {
    const solo = new Map(ids.map(id => [id, []]));
    const pairs = new Map();
    const trio = [];

    for (const r of rows) {
        const inTeam = ids.filter(id => r.players.includes(id));

        for (const id of inTeam) {
            if (solo.get(id).length < RESENHA_HISTORY) solo.get(id).push(r);
        }

        if (inTeam.length === 3) {
            if (trio.length < RESENHA_HISTORY) trio.push(r);
        } else if (inTeam.length === 2) {
            const k = [...inTeam].sort((a, b) => a - b).join('-');
            if (!pairs.has(k)) pairs.set(k, []);
            pairs.get(k).push(r);
        }
    }

    const all = [...solo.values()].flat();
    if (!all.length) return { score: null, trio, pairs, solo };

    // Ponto de partida: a fase dos três, puxada para o meio quando são poucas Arenas.
    const prior = (all.reduce((s, r) => s + placeValue(r.placement), 0) + 5 * 0.5) / (all.length + 5);

    let sum = trio.reduce((s, r) => s + placeValue(r.placement), 0);
    let weight = trio.length;

    for (const list of pairs.values()) {
        sum += PAIR_WEIGHT * list.reduce((s, r) => s + placeValue(r.placement), 0);
        weight += PAIR_WEIGHT * list.length;
    }

    const value = (sum + RESENHA_PRIOR * prior) / (weight + RESENHA_PRIOR);

    // Invertido: colocação ruim = mais resenha.
    return { score: Math.round(1 + 99 * (1 - value)), trio, pairs, solo };
}

async function measureTrio() {
    if ($('view-resenha').hidden) return;   // mede ao abrir a aba

    const ids = trioIds();
    const token = ++resenhaToken;

    if (ids.length < 3) {
        setGauge(null);
        $('resenhaBasis').textContent = `Escolha mais ${3 - ids.length} ${3 - ids.length === 1 ? 'jogador' : 'jogadores'}.`;
        $('resenhaDetails').replaceChildren();
        return;
    }

    if (!backendOn()) {
        $('resenhaBasis').textContent = 'Desligado: preencha SUPABASE_URL e SUPABASE_KEY em js/config.js.';
        return;
    }

    $('resenhaBasis').textContent = 'Medindo...';

    try {
        const rows = await fetchTeams(ids);
        if (token !== resenhaToken) return;

        const result = scoreTrio(ids, rows);
        setGauge(result.score);
        renderResenha(ids, result);
    } catch (err) {
        if (token !== resenhaToken) return;
        setGauge(null);
        $('resenhaDetails').replaceChildren();
        $('resenhaBasis').textContent = /arena_teams/.test(err.message)
            ? 'O Resenhômetro ainda não foi ativado no banco (rode o schema.sql atualizado).'
            : 'Não foi possível medir: ' + err.message;
    }
}

// ---------- Trios mais resenha ----------
async function fetchAllTeams() {
    if (!allTeams) {
        allTeams = (async () => {
            const rows = [];
            for (let from = 0; ; from += 1000) {
                const page = await api('arena_teams?select=match_id,played_at,placement,players' +
                    `&order=played_at.desc,match_id,placement&offset=${from}&limit=1000`);
                rows.push(...page);
                if (page.length < 1000) return rows;
            }
        })().catch(err => { allTeams = null; throw err; });
    }

    return allTeams;
}

async function showTopTrios() {
    const box = $('topList');
    const btn = $('topTrios');

    box.hidden = false;
    box.replaceChildren(cell('p', 'Testando todos os trios...', 'sub'));
    btn.disabled = true;

    try {
        const rows = await fetchAllTeams();
        const known = new Set(roster.map(p => p.id));

        // Só quem já caiu no mesmo time que alguém pode formar trio com Arenas juntos.
        const together = new Set();
        for (const r of rows) {
            if (r.players.length === 3 && r.players.every(id => known.has(id))) together.add(r.players.join(','));
        }

        const ranked = [...together]
            .map(key => {
                const ids = key.split(',').map(Number);
                return { ids, ...scoreTrio(ids, rows.filter(r => r.players.some(id => ids.includes(id)))) };
            })
            .filter(t => t.trio.length >= TOP_MIN_TOGETHER)
            .sort((a, b) => b.score - a.score || b.trio.length - a.trio.length)
            .slice(0, TOP_SIZE);

        renderTopTrios(ranked);
    } catch (err) {
        box.replaceChildren(cell('p', /arena_teams/.test(err.message)
            ? 'O Resenhômetro ainda não foi ativado no banco (rode o schema.sql atualizado).'
            : 'Não foi possível montar os trios: ' + err.message, 'sub'));
    } finally {
        btn.disabled = false;
    }
}

function renderTopTrios(ranked) {
    const box = $('topList');
    const name = id => (roster.find(p => p.id === id) || { name: '?' }).name;

    if (!ranked.length) {
        box.replaceChildren(cell('p', `Nenhum trio jogou ${TOP_MIN_TOGETHER} Arenas juntos ainda.`, 'sub'));
        return;
    }

    box.replaceChildren(...ranked.map((t, i) => {
        const tier = RESENHA_TIERS.find(x => t.score <= x.max);
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'rs-top-item';
        item.title = 'Ver este trio no velocímetro';

        const score = cell('span', t.score, 'rs-top-score');
        score.style.color = GAUGE_COLORS[RESENHA_TIERS.indexOf(tier)];

        const text = document.createElement('span');
        text.className = 'rs-top-text';
        text.append(
            cell('span', t.ids.map(name).join(' + '), 'rs-name'),
            cell('span', `${tier.label} · ${t.trio.length} Arenas juntos · média ${avgPlace(t.trio).toFixed(1)}`, 'rs-meta')
        );

        item.append(cell('span', ordinal(i + 1), 'rs-top-pos'), text, score);
        item.addEventListener('click', () => {
            t.ids.forEach((id, j) => { $('trio' + j).value = id; });
            syncTrioSelects();
            $('gauge').scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        return item;
    }));
}

// ---------- Detalhes ----------
function renderResenha(ids, { score, trio, pairs, solo }) {
    const name = id => (roster.find(p => p.id === id) || { name: '?' }).name;
    const pairCount = [...pairs.values()].reduce((s, l) => s + l.length, 0);

    $('resenhaBasis').textContent =
        score == null ? 'Nenhuma Arena desses jogadores importada ainda.'
        : trio.length ? `Baseado em ${trio.length} ${trio.length === 1 ? 'Arena' : 'Arenas'} do trio` +
            (pairCount ? ` e ${pairCount} em dupla.` : '.')
        : pairCount ? `Os três nunca caíram juntos: baseado em ${pairCount} ${pairCount === 1 ? 'Arena' : 'Arenas'} em dupla e na fase de cada um.`
        : 'Nunca jogaram juntos: palpite pela fase de cada um.';

    const box = $('resenhaDetails');
    box.replaceChildren();
    if (score == null) return;

    const stat = (label, list, extra) => {
        const row = document.createElement('div');
        row.className = 'rs-row' + (list.length ? '' : ' empty');
        row.append(cell('span', label, 'rs-name'));

        if (!list.length) {
            row.append(cell('span', 'nunca', 'rs-meta'));
            return row;
        }

        const firsts = list.filter(r => r.placement === 1).length;
        row.append(cell('span',
            `${list.length} ${list.length === 1 ? 'Arena' : 'Arenas'} · média ${avgPlace(list).toFixed(1)}` +
            (firsts ? ` · ${firsts}× 1º` : ''), 'rs-meta'));
        if (extra) row.append(extra);
        return row;
    };

    const section = (title, rows) => {
        const s = document.createElement('section');
        s.className = 'rs-block';
        s.append(cell('h2', title), ...rows);
        return s;
    };

    // Trio: últimas colocações juntos.
    const recent = document.createElement('span');
    recent.className = 'rs-recent';
    for (const r of trio.slice(0, 10)) {
        const chip = cell('span', ordinal(r.placement), 'rs-chip ' + (r.placement === 1 ? 'first' : r.placement <= 3 ? 'up' : 'down'));
        chip.title = new Date(r.played_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        recent.append(chip);
    }

    box.append(
        section('Trio', [stat(ids.map(name).join(' + '), trio, trio.length ? recent : null)]),
        section('Duplas', [[0, 1], [0, 2], [1, 2]].map(([a, b]) => {
            const k = [ids[a], ids[b]].sort((x, y) => x - y).join('-');
            return stat(`${name(ids[a])} + ${name(ids[b])}`, pairs.get(k) || []);
        })),
        section('Fase de cada um', ids.map(id => stat(name(id), solo.get(id))))
    );
}

// ---------- Eventos ----------
buildGauge();

for (let i = 0; i < 3; i++) $('trio' + i).addEventListener('change', syncTrioSelects);
$('trioShuffle').addEventListener('click', shuffleTrio);
$('topTrios').addEventListener('click', showTopTrios);

document.addEventListener('rosterchange', fillTrioSelects);
document.addEventListener('viewchange', e => {
    if (e.detail !== 'resenha') return;
    resenhaCache.clear();   // o robô pode ter importado Arenas novas
    allTeams = null;
    if (rosterLoaded) measureTrio();
});

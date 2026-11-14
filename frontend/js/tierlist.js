// Tier list dos campeões da Arena (gaveta lateral da aba Areninha, aberta pela alça na borda).
// Nota de cada campeão: colocação média de 0 a 1 (1º = 1, 6º = 0), puxada para o meio
// quando tem poucas Arenas. Tiers por posição: 10% S, 20% A, 40% B, 20% C, 10% D.

const TIER_MIN_GAMES = 3;     // menos que isso fica fora ("poucos jogos")
const TIER_PRIOR = 3;         // quantas Arenas "médias" cada campeão começa tendo
const TIER_SHOW = 15;         // ícones por tier antes do "+N" (duas linhas na gaveta)
const TIERS = [
    { name: 'S', upTo: 0.10 },
    { name: 'A', upTo: 0.30 },
    { name: 'B', upTo: 0.70 },
    { name: 'C', upTo: 0.90 },
    { name: 'D', upTo: 1.00 }
];
const TIER_KEY = 'tierFilters';

let tierRows = null;          // linhas da view arena_champions
let tierLoadedAt = 0;
let tierLoading = false;
const tierOpen = new Set();   // tiers expandidas

async function fetchTierRows() {
    const rows = [];

    for (let from = 0; ; from += 1000) {
        const page = await api('arena_champions?select=*&order=champion,player_id,season' +
            `&offset=${from}&limit=1000`);
        rows.push(...page);
        if (page.length < 1000) return rows;
    }
}

async function refreshTiers() {
    if (tierLoading || !backendOn()) return;
    tierLoading = true;

    try {
        tierRows = await fetchTierRows();
        tierLoadedAt = Date.now();
        renderTiers();
    } catch (err) {
        $('tierList').replaceChildren(cell('p', /arena_champions/.test(err.message)
            ? 'A tier list ainda não foi ativada no banco (rode o schema.sql atualizado).'
            : 'Não foi possível carregar: ' + err.message, 'sub'));
    } finally {
        tierLoading = false;
    }
}

// Soma as linhas do filtro escolhido e dá a nota de cada campeão.
// Conta todas as Arenas importadas (temporada + histórico de cada um).
function rankChampions(playerId) {
    const byChamp = new Map();

    for (const r of tierRows) {
        if (playerId && r.player_id !== playerId) continue;

        let c = byChamp.get(r.champion);
        if (!c) {
            c = { name: r.champion, games: 0, value: 0, placeSum: 0, firsts: 0, players: new Map() };
            byChamp.set(r.champion, c);
        }

        c.games += r.games;
        c.value += r.value_sum;
        c.placeSum += r.placement_sum;
        c.firsts += r.firsts;
        c.players.set(r.player_id, (c.players.get(r.player_id) || 0) + r.games);
    }

    const all = [...byChamp.values()];
    for (const c of all) c.score = (c.value + TIER_PRIOR * 0.5) / (c.games + TIER_PRIOR);

    const ranked = all.filter(c => c.games >= TIER_MIN_GAMES)
        .sort((a, b) => b.score - a.score || b.games - a.games);

    return { ranked, few: all.length - ranked.length };
}

function champLabel(c) {
    const [topId] = [...c.players.entries()].sort((a, b) => b[1] - a[1])[0] || [];
    const top = roster.find(p => p.id === topId);

    return `${c.name} · ${c.games} Arenas · média ${(c.placeSum / c.games).toFixed(1)}` +
        (c.firsts ? ` · ${c.firsts}× 1º` : '') +
        (top && !Number($('tierPlayer').value) ? ` · mais jogado por ${top.name}` : '');
}

function renderTiers() {
    if (!tierRows) return;

    const playerId = Number($('tierPlayer').value) || 0;
    const { ranked, few } = rankChampions(playerId);
    const box = $('tierList');

    $('tierDetail').textContent = '';

    if (!ranked.length) {
        box.replaceChildren(cell('p', `Nenhum campeão com ${TIER_MIN_GAMES}+ Arenas neste filtro.`, 'sub'));
        $('tierFoot').textContent = '';
        return;
    }

    // Tier de cada campeão pela posição na lista.
    const groups = TIERS.map(t => ({ ...t, champs: [] }));
    ranked.forEach((c, i) => {
        const pos = (i + 0.5) / ranked.length;
        groups.find(t => pos <= t.upTo).champs.push(c);
    });

    box.replaceChildren(...groups.map(t => {
        const row = document.createElement('div');
        row.className = 'tier-row tier-' + t.name.toLowerCase();

        const icons = document.createElement('div');
        icons.className = 'tier-icons';

        const open = tierOpen.has(t.name);
        const shown = open ? t.champs : t.champs.slice(0, TIER_SHOW);

        for (const c of shown) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tier-champ';
            btn.title = champLabel(c);
            btn.setAttribute('aria-label', btn.title);
            btn.append(portrait(c.name));
            btn.addEventListener('click', () => { $('tierDetail').textContent = champLabel(c); });
            icons.append(btn);
        }

        if (t.champs.length > TIER_SHOW) {
            const more = document.createElement('button');
            more.type = 'button';
            more.className = 'tier-more';
            more.textContent = open ? 'menos' : '+' + (t.champs.length - TIER_SHOW);
            more.addEventListener('click', () => {
                if (open) tierOpen.delete(t.name); else tierOpen.add(t.name);
                renderTiers();
            });
            icons.append(more);
        }

        if (!t.champs.length) icons.append(cell('span', '–', 'tier-empty'));

        row.append(cell('span', t.name, 'tier-letter'), icons);
        return row;
    }));

    $('tierFoot').textContent = `${ranked.length} campeões com ${TIER_MIN_GAMES}+ Arenas` +
        (few ? ` (${few} com menos ficam de fora)` : '') + '. Toque num campeão para ver os números.';
}

// ---------- Filtros ----------
function fillTierPlayers() {
    const sel = $('tierPlayer');
    const keep = Number(sel.value) || savedTierFilters().player || 0;

    const all = document.createElement('option');
    all.value = '';
    all.textContent = 'Todos';

    sel.replaceChildren(all, ...roster.map(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        return opt;
    }));

    if (roster.some(p => p.id === keep)) sel.value = keep;
    renderTiers();
}

function savedTierFilters() {
    try { return JSON.parse(localStorage.getItem(TIER_KEY)) || {}; } catch (e) { return {}; }
}

function onTierFilter() {
    tierOpen.clear();
    try {
        localStorage.setItem(TIER_KEY, JSON.stringify({
            player: Number($('tierPlayer').value) || 0
        }));
    } catch (e) { /* sem armazenamento */ }
    renderTiers();
}

$('tierPlayer').addEventListener('change', onTierFilter);
$('refreshArena').addEventListener('click', refreshTiers);
$('tierHandle').addEventListener('click', () => {
    openDialog($('tierDrawer'));
    if (Date.now() - tierLoadedAt > 120000) refreshTiers();
});
document.addEventListener('rosterchange', fillTierPlayers);

document.addEventListener('viewchange', e => {
    if (e.detail === 'arena' && Date.now() - tierLoadedAt > 120000) refreshTiers();
});

if (!$('view-arena').hidden) refreshTiers();

// Gerenciador de campeões bloqueados (arrastar e soltar, pesquisa, filtro por rota).

let laneFilter = '';

// ---------- Bloqueados ----------
// Campeões bloqueados: chave normalizada -> nome exibido.
let blocked = new Map();

function excludedNames() {
    return new Set(blocked.keys());
}

function setExcluded(names) {
    for (const name of names) {
        blocked.set(norm(name), name);
    }

    renderPools();
    save();
}

// Cada quadradinho é criado uma vez só e depois apenas reaproveitado/movido.
const tileCache = new Map();

function makeTile(champ) {
    if (tileCache.has(champ.key)) return tileCache.get(champ.key);

    const tile = document.createElement('div');

    tile.className = 'tile';
    tile.draggable = true;
    tile.dataset.key = champ.key;
    tile.title = champ.name + ' — arraste para a outra lista ou dê duplo clique';

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = champ.name;

    tile.append(portrait(champ.name), name);

    if (champ.lanes.length) {
        const tag = document.createElement('span');
        tag.className = 'lanes';
        tag.textContent = champ.lanes.join(' · ');
        tile.append(tag);
    }

    tile.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', champ.key);
        e.dataTransfer.effectAllowed = 'move';
        tile.classList.add('dragging');
    });

    tile.addEventListener('dragend', () => tile.classList.remove('dragging'));

    tile.addEventListener('dblclick', () => toggleBlocked(champ.key, champ.name));

    tileCache.set(champ.key, tile);

    return tile;
}

function toggleBlocked(key, name) {
    if (blocked.has(key)) {
        blocked.delete(key);
        $('status').textContent = `✅ ${name} liberado para a roleta.`;
    } else {
        blocked.set(key, name);
        $('status').textContent = `🚫 ${name} bloqueado.`;
    }

    renderPools();
    save();
}

function emptyMessage(icon, text) {
    const div = document.createElement('div');
    div.className = 'none';

    const b = document.createElement('b');
    b.textContent = icon;

    const span = document.createElement('span');
    span.textContent = text;

    const inner = document.createElement('div');
    inner.append(b, document.createElement('br'), span);
    div.append(inner);

    return div;
}

function renderPools() {
    const all = allChampions();
    const byKey = new Map(all.map(c => [c.key, c]));

    const qAvail = searchKey($('searchAvail').value);
    const qBlock = searchKey($('searchBlock').value);

    const available = all.filter(c => !blocked.has(c.key));

    const shownAvail = available.filter(c =>
        c.search.includes(qAvail) &&
        (!laneFilter || c.lanes.includes(laneFilter))
    );

    // Bloqueados podem incluir nomes que não estão na lista padrão.
    const blockedChamps = [...blocked.entries()]
        .map(([k, n]) => byKey.get(k) || { key: k, name: n, lanes: [], search: searchKey(n) })
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    const shownBlock = blockedChamps.filter(c => c.search.includes(qBlock));

    // Monta fora da tela e troca tudo de uma vez (reaproveitando os quadradinhos existentes).
    const fragA = document.createDocumentFragment();
    const fragB = document.createDocumentFragment();

    for (const c of shownAvail) fragA.append(makeTile(c));
    for (const c of shownBlock) fragB.append(makeTile(c));

    if (!shownAvail.length) {
        fragA.append(emptyMessage('🔍', 'Nenhum campeão encontrado.'));
    }

    if (!shownBlock.length) {
        fragB.append(blocked.size
            ? emptyMessage('🔍', 'Nenhum bloqueado encontrado.')
            : emptyMessage('⤵', 'Arraste campeões para cá para bloqueá-los.'));
    }

    $('availList').replaceChildren(fragA);
    $('blockList').replaceChildren(fragB);

    $('availCount').textContent = available.length;
    $('blockCount').textContent = blocked.size;

    // Disponíveis por rota (cada rota precisa de 6 para o sorteio).
    const counts = $('laneCounts');
    counts.replaceChildren();

    for (const lane of lanes) {
        const n = available.filter(c => c.lanes.includes(lane)).length;
        const span = document.createElement('span');

        span.textContent = `${lane} ${n}`;

        if (n < 6) {
            span.className = 'low';
            span.title = 'Menos de 6 disponíveis: o sorteio vai falhar';
        }

        counts.append(span);
    }
}

// Zonas de soltar.
for (const box of [$('availBox'), $('blockBox')]) {
    box.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        box.classList.add('over');
    });

    box.addEventListener('dragleave', e => {
        if (!box.contains(e.relatedTarget)) {
            box.classList.remove('over');
        }
    });

    box.addEventListener('drop', e => {
        e.preventDefault();
        box.classList.remove('over');

        const key = e.dataTransfer.getData('text/plain');

        if (!key) return;

        const wantBlocked = box.dataset.zone === 'block';

        if (wantBlocked === blocked.has(key)) return;

        const champ = allChampions().find(c => c.key === key);
        const name = blocked.get(key) || (champ && champ.name) || key;

        toggleBlocked(key, name);
    });
}

for (const id of ['searchAvail', 'searchBlock']) {
    $(id).addEventListener('input', renderPools);
}

$('laneFilter').addEventListener('click', e => {
    const btn = e.target.closest('button');

    if (!btn) return;

    laneFilter = btn.dataset.lane;

    for (const b of $('laneFilter').children) {
        b.classList.toggle('active', b === btn);
    }

    renderPools();
});

$('clearPlayed').addEventListener('click', () => {
    if (!confirm('Deseja liberar todos os campeões bloqueados?')) {
        return;
    }

    blocked.clear();

    renderPools();
    save();

    $('status').textContent =
        '✅ Todos os campeões foram liberados.';
});

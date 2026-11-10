// Sorteio de campeões por rota e marcação dos campeões jogados.

const PICKS_PER_TEAM = 5;

let last = null;
let selected = [new Set(), new Set()]; // campeões jogados por time (qualquer rota, até 5 cada)
let registered = false;

function draw() {
    try {
        const source = sourcePools();

        const pools = {};

        for (const lane of lanes) {
            const seen = new Set();

            pools[lane] = (source[lane] || []).filter(name => {
                const k = norm(name);

                if (!k || seen.has(k)) {
                    return false;
                }

                seen.add(k);
                return true;
            });

            if (pools[lane].length < 6) {
                throw Error(
                    `A rota ${lane} precisa ter pelo menos 6 campeões diferentes.`
                );
            }
        }

        const teams = [{}, {}];
        const used = excludedNames();

        for (const lane of shuffle(lanes)) {
            const available = shuffle(
                pools[lane].filter(n => !used.has(norm(n)))
            );

            if (available.length < 6) {
                throw Error(
                    `Não há 30 campeões distintos disponíveis. A rota ${lane} ficou com menos de 6 opções sem repetição.`
                );
            }

            const chosen = available.slice(0, 6);

            chosen.forEach(n => used.add(norm(n)));

            teams[0][lane] = chosen.slice(0, 3);
            teams[1][lane] = chosen.slice(3, 6);
        }

        last = teams;
        selected = [new Set(), new Set()];
        registered = false;

        render();

        notify('✅ 30 campeões sorteados, sem repetir e sem bloqueados.');

    } catch (err) {
        notify('⚠️ ' + err.message);
    }
}

function selectedCount() {
    return selected[0].size + selected[1].size;
}

function updateProgress() {
    const n = selectedCount();

    $('progressText').textContent = registered ? '10/10' : `${n}/10`;
    $('progressText').classList.toggle('done', registered);
    $('progressBar').style.width = (registered ? 100 : n * 10) + '%';
    $('markPlayed').disabled = !last || registered ||
        selected.some(s => s.size !== PICKS_PER_TEAM);

    $('board').classList.toggle('registered', registered);

    for (let i = 0; i < 2; i++) {
        const el = $('picked' + i);
        el.textContent = `${selected[i].size}/${PICKS_PER_TEAM}`;
        el.classList.toggle('full', selected[i].size === PICKS_PER_TEAM);
        el.hidden = !last || (!n && !registered);
    }
}

// Atualiza os botões de um time: marcado, ou apagado quando o time já tem 5.
function paintTeam(i) {
    const full = selected[i].size >= PICKS_PER_TEAM;

    for (const c of $('results').querySelectorAll(`.champ[data-team="${i}"]`)) {
        const sel = selected[i].has(c.dataset.name);

        c.classList.toggle('selected', sel);
        c.classList.toggle('dim', full && !sel);
        c.setAttribute('aria-pressed', String(sel));
    }
}

function champButton(name, i, delay) {
    const cell = document.createElement('button');

    cell.type = 'button';
    cell.className = 'champ';
    cell.dataset.team = i;
    cell.dataset.name = name;
    cell.title = name;
    cell.style.setProperty('--d', delay + 'ms');

    const nm = document.createElement('span');
    nm.className = 'name';
    nm.textContent = name;

    const mark = document.createElement('span');
    mark.className = 'mark';
    mark.append(icon('check'));

    cell.append(portrait(name), mark, nm);

    cell.addEventListener('click', () => {
        if (registered) {
            notify('⚠️ Estes campeões já foram bloqueados. Sorteie de novo para marcar outros.');
            return;
        }

        const picks = selected[i];

        if (picks.has(name)) {
            picks.delete(name);
        } else if (picks.size >= PICKS_PER_TEAM) {
            notify(`⚠️ ${teamTitle(i)} já tem ${PICKS_PER_TEAM} campeões. Desmarque um para trocar.`);
            return;
        } else {
            picks.add(name);
        }

        paintTeam(i);
        updateProgress();
    });

    return cell;
}

// Tabuleiro espelhado: uma linha por rota, Azul à esquerda e Vermelho à direita.
// O primeiro campeão de cada lado fica junto da coluna das rotas; a revelação sai do centro.
function render() {
    const host = $('results');
    const frag = document.createDocumentFragment();

    lanes.forEach((lane, r) => {
        const row = document.createElement('div');
        row.className = 'lane-row';
        row.style.setProperty('--d', r * 50 + 'ms');

        const groups = last.map((team, i) => {
            const g = document.createElement('div');
            g.className = 'picks ' + (i === 0 ? 'blue' : 'red');

            team[lane].forEach((name, k) => g.append(champButton(name, i, r * 50 + k * 45 + 60)));

            return g;
        });

        const tag = document.createElement('span');
        tag.className = 'lane-tag';
        tag.textContent = lane;

        row.append(groups[0], tag, groups[1]);
        frag.append(row);
    });

    host.classList.remove('reveal');
    host.replaceChildren(frag);
    void host.offsetWidth;
    host.classList.add('reveal');

    paintTeam(0);
    paintTeam(1);
    updateProgress();
}

function formatted() {
    return last.map((team, i) =>
        `${($('team' + (i + 1)).value.trim() || 'Time ' + (i + 1)).toUpperCase()}\n` +
        lanes.map(lane =>
            `${lane}: ${team[lane].join(', ')}`
        ).join('\n')
    ).join('\n\n');
}

$('draw').addEventListener('click', () => {
    const btn = $('draw');
    btn.classList.remove('rolling');
    void btn.offsetWidth;
    btn.classList.add('rolling');
    draw();
});

// Tecla S sorteia de novo (fora de campos de texto e de janelas abertas).
document.addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 's' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest('input, select, textarea, [contenteditable]')) return;
    if (document.querySelector('dialog[open]') || $('view-match').hidden) return;

    e.preventDefault();
    $('draw').click();
});

function copied() {
    const btn = $('copy');
    btn.classList.add('copied');
    setTimeout(() => btn.classList.remove('copied'), 1400);
}

$('copy').addEventListener('click', async () => {
    if (!last) {
        notify('⚠️ Faça um sorteio antes de copiar.');
        return;
    }

    try {
        await navigator.clipboard.writeText(formatted());

        copied();
        notify('📋 Resultado copiado.');

    } catch {
        const t = document.createElement('textarea');

        t.value = formatted();
        document.body.append(t);
        t.select();

        const ok = document.execCommand('copy');

        t.remove();

        if (ok) copied();

        notify(ok
            ? '📋 Resultado copiado.'
            : '⚠️ Não foi possível copiar automaticamente.');
    }
});

$('markPlayed').addEventListener('click', () => {
    if (!last) {
        notify('⚠️ Sorteie os times primeiro.');
        return;
    }

    if (registered) {
        notify('⚠️ Estes campeões já foram bloqueados. Sorteie de novo.');
        return;
    }

    const short = [0, 1].find(i => selected[i].size !== PICKS_PER_TEAM);

    if (short !== undefined) {
        notify(`⚠️ Selecione ${PICKS_PER_TEAM} campeões em cada time (de qualquer rota). ` +
            `${teamTitle(short)} está com ${selected[short].size}.`);
        return;
    }

    const names = [...selected[0], ...selected[1]];

    const before = blocked.size;

    setExcluded(names);

    registered = true;
    updateProgress();

    notify(`✅ ${blocked.size - before} campeões jogados bloqueados. Os outros 20 continuam na roleta.`);
});

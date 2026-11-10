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

        $('status').textContent =
            '✅ Sorteio realizado! 30 campeões diferentes, sem os bloqueados.';

    } catch (err) {
        $('status').textContent = '⚠️ ' + err.message;
    }
}

function selectedCount() {
    return selected[0].size + selected[1].size;
}

function updateProgress() {
    const n = selectedCount();

    $('progressText').textContent = registered ? 'Registrada' : `${n}/10`;
    $('progressBar').style.width = (registered ? 100 : n * 10) + '%';
    $('markPlayed').disabled = !last || registered ||
        selected.some(s => s.size !== PICKS_PER_TEAM);
}

// Atualiza os botões de um time: marcado, ou apagado quando o time já tem 5.
function paintTeam(section, i) {
    const full = selected[i].size >= PICKS_PER_TEAM;

    for (const c of section.querySelectorAll('.champ')) {
        const sel = selected[i].has(c.title);

        c.classList.toggle('selected', sel);
        c.classList.toggle('dim', full && !sel);
        c.setAttribute('aria-pressed', String(sel));
    }
}

function render() {
    const host = $('results');

    host.replaceChildren();

    last.forEach((team, i) => {
        const section = document.createElement('section');
        section.className = 'card team ' + (i === 0 ? 'blue' : 'red');

        const title = document.createElement('h2');

        title.id = 'resultTitle' + i;
        title.textContent = teamTitle(i);

        section.append(title);

        for (const lane of lanes) {
            const row = document.createElement('div');
            row.className = 'lane';

            const label = document.createElement('span');
            label.className = 'lane-tag';
            label.textContent = lane;

            const champions = document.createElement('div');
            champions.className = 'champions';

            for (const name of team[lane]) {
                const cell = document.createElement('button');

                cell.type = 'button';
                cell.className = 'champ';

                const nm = document.createElement('span');
                nm.className = 'name';
                nm.textContent = name;

                cell.title = name;
                cell.append(portrait(name), nm);

                cell.addEventListener('click', () => {
                    if (registered) {
                        $('status').textContent =
                            '⚠️ Esta partida já foi registrada. Sorteie outra para selecionar novos campeões.';
                        return;
                    }

                    const picks = selected[i];

                    if (picks.has(name)) {
                        picks.delete(name);
                    } else if (picks.size >= PICKS_PER_TEAM) {
                        $('status').textContent =
                            `⚠️ ${teamTitle(i)} já tem ${PICKS_PER_TEAM} campeões. Desmarque um para trocar.`;
                        return;
                    } else {
                        picks.add(name);
                    }

                    paintTeam(section, i);
                    updateProgress();

                    $('status').textContent =
                        `🎮 ${teamTitle(0)}: ${selected[0].size}/${PICKS_PER_TEAM} · ` +
                        `${teamTitle(1)}: ${selected[1].size}/${PICKS_PER_TEAM}`;
                });

                champions.append(cell);
            }

            row.append(label, champions);
            section.append(row);
        }

        paintTeam(section, i);
        host.append(section);
    });

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

$('draw').addEventListener('click', draw);

$('copy').addEventListener('click', async () => {
    if (!last) {
        $('status').textContent =
            '⚠️ Faça um sorteio antes de copiar.';
        return;
    }

    try {
        await navigator.clipboard.writeText(formatted());

        $('status').textContent = '📋 Resultado copiado!';

    } catch {
        const t = document.createElement('textarea');

        t.value = formatted();
        document.body.append(t);
        t.select();

        const ok = document.execCommand('copy');

        t.remove();

        $('status').textContent = ok
            ? '📋 Resultado copiado!'
            : '⚠️ Não foi possível copiar automaticamente.';
    }
});

$('markPlayed').addEventListener('click', () => {
    if (!last) {
        $('status').textContent =
            '⚠️ Sorteie os times primeiro.';
        return;
    }

    if (registered) {
        $('status').textContent =
            '⚠️ Esta partida já foi registrada. Sorteie outra.';
        return;
    }

    const short = [0, 1].find(i => selected[i].size !== PICKS_PER_TEAM);

    if (short !== undefined) {
        $('status').textContent =
            `⚠️ Selecione ${PICKS_PER_TEAM} campeões em cada time (de qualquer rota). ` +
            `${teamTitle(short)} está com ${selected[short].size}.`;
        return;
    }

    const names = [...selected[0], ...selected[1]];

    const before = blocked.size;

    setExcluded(names);

    registered = true;
    updateProgress();

    $('status').textContent =
        `✅ Partida registrada! ${blocked.size - before} campeão(ões) jogado(s) bloqueado(s). Os outros 20 continuam disponíveis.`;
});

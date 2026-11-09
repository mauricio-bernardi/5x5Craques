// Sorteio de campeões por rota e marcação dos campeões jogados.

let last = null;
let selected = {};
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
        selected = {};
        registered = false;

        render();

        $('status').textContent =
            '✅ Sorteio realizado! 30 campeões diferentes, sem os bloqueados.';

    } catch (err) {
        $('status').textContent = '⚠️ ' + err.message;
    }
}

function selectedCount() {
    return Object.values(selected).filter(Boolean).length;
}

function updateProgress() {
    const n = selectedCount();

    $('progressText').textContent = registered ? 'Registrada' : `${n}/10`;
    $('progressBar').style.width = (registered ? 100 : n * 10) + '%';
    $('markPlayed').disabled = !last || registered || n !== 10;
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

            const key = i + '-' + lane;

            for (const name of team[lane]) {
                const cell = document.createElement('button');
                const isSel = selected[key] === name;

                cell.type = 'button';
                cell.className =
                    'champ' +
                    (isSel ? ' selected' : '') +
                    (selected[key] && !isSel ? ' dim' : '');

                const nm = document.createElement('span');
                nm.className = 'name';
                nm.textContent = name;

                cell.title = name;
                cell.append(portrait(name), nm);
                cell.setAttribute('aria-pressed', String(isSel));

                cell.addEventListener('click', () => {
                    if (registered) {
                        $('status').textContent =
                            '⚠️ Esta partida já foi registrada. Sorteie outra para selecionar novos campeões.';
                        return;
                    }

                    selected[key] =
                        selected[key] === name ? undefined : name;

                    // Atualiza só os 3 botões desta rota, sem redesenhar tudo.
                    for (const c of champions.children) {
                        const sel = selected[key] === c.title;

                        c.classList.toggle('selected', sel);
                        c.classList.toggle('dim', !!selected[key] && !sel);
                        c.setAttribute('aria-pressed', String(sel));
                    }

                    updateProgress();

                    $('status').textContent =
                        `🎮 ${selectedCount()}/10 campeões selecionados.`;
                });

                champions.append(cell);
            }

            row.append(label, champions);
            section.append(row);
        }

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

    const names = [];

    for (let i = 0; i < 2; i++) {
        for (const lane of lanes) {
            const name = selected[i + '-' + lane];

            if (!name) {
                $('status').textContent =
                    '⚠️ Selecione exatamente 1 campeão por rota em cada time (10 no total).';
                return;
            }

            names.push(name);
        }
    }

    const before = blocked.size;

    setExcluded(names);

    registered = true;
    updateProgress();

    $('status').textContent =
        `✅ Partida registrada! ${blocked.size - before} campeão(ões) jogado(s) bloqueado(s). Os outros 20 continuam disponíveis.`;
});

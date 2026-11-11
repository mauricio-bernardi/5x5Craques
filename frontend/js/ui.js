// Peças de interface compartilhadas: ícones, avisos (toast), modal de confirmação,
// gavetas laterais e troca entre as vistas Partida / Ranking.

// ---------- Ícones ----------
const SVG_NS = 'http://www.w3.org/2000/svg';

function icon(name) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'i');
    svg.setAttribute('aria-hidden', 'true');

    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#i-' + name);

    svg.append(use);
    return svg;
}

function iconButton(name, title, className) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'icon-btn' + (className ? ' ' + className : '');
    b.title = title;
    b.setAttribute('aria-label', title);
    b.append(icon(name));
    return b;
}

// Tira o emoji do começo das mensagens antigas ("⚠️ ...", "✅ ...").
const leadingEmoji = /^[\p{Extended_Pictographic}⤵️‍\s]+/u;
const cleanText = text => String(text).replace(leadingEmoji, '');
const isWarning = text => /^\s*⚠/.test(String(text));

// ---------- Avisos ----------
// Mensagens que começam com ⚠️ aparecem como alerta (ficam mais tempo na tela).
let uiReady = false;   // ligado pelo main.js: avisos de sucesso durante a carga ficam em silêncio
let toastTimer = null;

function notify(text) {
    const el = $('status');
    const warn = isWarning(text);

    if (!uiReady && !warn) return;

    el.replaceChildren(icon(warn ? 'alert' : 'check'), document.createTextNode(cleanText(text)));
    el.classList.toggle('warn', warn);

    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), warn ? 5200 : 2600);
}

$('status').addEventListener('click', () => $('status').classList.remove('show'));

// Linha de status dentro de um formulário (admin). ⚠️ no começo = erro.
function setLine(id, text) {
    const el = $(id);
    el.textContent = cleanText(text);
    el.classList.toggle('error', isWarning(text));
}

// ---------- Diálogos (modal e gavetas) ----------
function openDialog(d) {
    if (d.open) return;
    d.classList.remove('closing');
    d.showModal();
}

function closeDialog(d, value) {
    if (!d.open || d.classList.contains('closing')) return;

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduce) {
        d.close(value);
        return;
    }

    d.classList.add('closing');
    setTimeout(() => {
        d.classList.remove('closing');
        d.close(value);
    }, 160);
}

for (const d of document.querySelectorAll('dialog')) {
    // Esc e clique fora fecham com animação.
    d.addEventListener('cancel', e => {
        e.preventDefault();
        closeDialog(d, 'cancel');
    });

    d.addEventListener('mousedown', e => {
        if (e.target === d) closeDialog(d, 'cancel');
    });

    for (const btn of d.querySelectorAll('[data-close]')) {
        btn.addEventListener('click', () => closeDialog(d, 'cancel'));
    }
}

// ---------- Confirmação / pergunta ----------
// ask({ title, text, ok, danger, input: { type, value, placeholder } })
// Sem input: resolve true/false. Com input: resolve o texto digitado ou null.
let askResolve = null;

function ask({ title, text = '', ok = 'Confirmar', danger = false, input = null }) {
    const d = $('askDialog');

    if (askResolve) askResolve(input ? null : false);

    $('askTitle').textContent = title;

    const body = $('askText');
    body.replaceChildren();

    if (typeof text === 'string') {
        body.textContent = text;
    } else if (text) {
        body.append(text);
    }

    body.hidden = !text;

    const field = $('askInput');
    field.hidden = !input;
    field.type = (input && input.type) || 'text';
    field.value = (input && input.value) || '';
    field.placeholder = (input && input.placeholder) || '';

    $('askOk').textContent = ok;
    $('askOk').classList.toggle('btn-danger', danger);
    $('askOk').classList.toggle('btn-primary', !danger);

    openDialog(d);

    if (input) {
        field.focus();
        field.select();
    } else {
        $('askOk').focus();
    }

    return new Promise(resolve => {
        askResolve = value => {
            askResolve = null;
            resolve(value);
        };

        d.addEventListener('close', () => {
            if (!askResolve) return;
            const okd = d.returnValue === 'ok';
            askResolve(input ? (okd ? field.value : null) : okd);
        }, { once: true });
    });
}

$('askForm').addEventListener('submit', e => {
    e.preventDefault();
    closeDialog($('askDialog'), 'ok');
});

$('askCancel').addEventListener('click', () => closeDialog($('askDialog'), 'cancel'));

// Duas listas de jogadores lado a lado, para os modais de registrar partida.
function teamsPreview(teams, winner, titles) {
    const wrap = document.createElement('div');
    wrap.className = 'preview-teams';

    teams.forEach((team, t) => {
        const col = document.createElement('div');
        col.className = 'preview-team ' + (t ? 'red' : 'blue') + (winner === t + 1 ? ' won' : '');

        const h = document.createElement('b');
        h.textContent = titles ? titles[t] : teamTitle(t);
        if (winner === t + 1) h.append(icon('trophy'));

        const ul = document.createElement('ul');
        for (const n of team) {
            const li = document.createElement('li');
            li.textContent = n;
            ul.append(li);
        }

        col.append(h, ul);
        wrap.append(col);
    });

    return wrap;
}

// Bloco de texto + aviso de jogadores novos, usado nos modais.
function confirmBody(parts) {
    const frag = document.createDocumentFragment();

    for (const p of parts) {
        if (!p) continue;

        if (typeof p === 'string') {
            const el = document.createElement('p');
            el.textContent = p;
            frag.append(el);
        } else {
            frag.append(p);
        }
    }

    return frag;
}

function unknownNote(unknown) {
    if (!unknown.length) return null;

    const p = document.createElement('p');
    p.className = 'note-warn';
    p.append(icon('alert'), document.createTextNode(
        `Novos no cadastro: ${unknown.join(', ')}. Se for nick escrito errado, cancele e cadastre como apelido.`
    ));

    return p;
}

// ---------- Vistas ----------
function showView(name) {
    for (const b of $('viewNav').children) {
        b.classList.toggle('active', b.dataset.view === name);
        b.setAttribute('aria-current', b.dataset.view === name ? 'page' : 'false');
    }

    for (const v of VIEWS) $('view-' + v).hidden = name !== v;
    document.body.dataset.view = name;

    const hash = VIEW_HASH[name] || '';
    // window.history: rating.js tem uma variável global chamada "history".
    if (location.hash !== hash) window.history.replaceState(null, '', hash || location.pathname + location.search);

    // Avisa quem precisa carregar dados ao abrir a vista (ex.: Areninha).
    document.dispatchEvent(new CustomEvent('viewchange', { detail: name }));
}

const VIEWS = ['match', 'rank', 'arena'];
const VIEW_HASH = { rank: '#ranking', arena: '#areninha' };

$('viewNav').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) showView(b.dataset.view);
});

showView(Object.keys(VIEW_HASH).find(v => VIEW_HASH[v] === location.hash) || 'match');

// Comunicação com o backend (Supabase).

const backendOn = () => !!(SUPABASE_URL && SUPABASE_KEY);

async function api(path, opts = {}) {
    const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };

    // Chaves antigas (JWT) também vão no Authorization; as novas (sb_...) não.
    if (!SUPABASE_KEY.startsWith('sb_')) headers.Authorization = 'Bearer ' + SUPABASE_KEY;

    const res = await fetch(SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/' + path, { ...opts, headers });
    const text = await res.text();

    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (e) {}

    if (!res.ok) {
        throw Error((body && (body.message || body.hint)) || `Erro ${res.status}`);
    }

    return body;
}

async function fetchMatches() {
    const all = [];

    for (let from = 0; ; from += 1000) {
        const page = await api(`match_history?select=*&order=played_at.asc,id.asc&offset=${from}&limit=1000`);

        all.push(...page);

        if (page.length < 1000) return all;
    }
}

function getSecret(ask) {
    let s = null;

    try { s = localStorage.getItem(secretKey); } catch (e) {}

    if (!s || ask) {
        s = prompt('Senha do grupo (a mesma definida no script SQL do Supabase):');

        if (!s) return null;

        try { localStorage.setItem(secretKey, s); } catch (e) {}
    }

    return s;
}

// Chama uma função protegida; se a senha guardada estiver errada, pede de novo uma vez.
async function rpc(fn, args) {
    for (let attempt = 0; attempt < 2; attempt++) {
        const secret = getSecret(attempt > 0);

        if (!secret) throw Error('Operação cancelada (sem senha).');

        try {
            return await api('rpc/' + fn, {
                method: 'POST',
                body: JSON.stringify({ p_secret: secret, ...args })
            });
        } catch (err) {
            if (attempt === 0 && /senha/i.test(err.message)) continue;
            throw err;
        }
    }
}

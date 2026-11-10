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

// ---------- Modo admin ----------
// A senha do grupo fica só na memória desta página: fechar, recarregar ou abrir outra aba pede de novo.
let adminSecret = null;

// Versões antigas guardavam a senha no navegador; apaga o que tiver sobrado.
try { localStorage.removeItem(secretKey); } catch (e) {}

async function secretIsValid(secret) {
    try {
        await api('rpc/verify_secret', { method: 'POST', body: JSON.stringify({ p_secret: secret }) });
        return true;
    } catch (err) {
        if (/senha/i.test(err.message)) return false;
        throw err;
    }
}

// Pede a senha e liga o modo admin. Devolve true se deu certo.
async function requestAdmin() {
    if (adminSecret) return true;

    const secret = prompt('Senha do grupo para entrar no modo admin:');
    if (!secret) return false;

    if (!await secretIsValid(secret)) {
        alert('Senha errada.');
        return false;
    }

    adminSecret = secret;
    setAdminMode(true);
    return true;
}

function exitAdmin() {
    adminSecret = null;
    setAdminMode(false);
}

// Chama uma função protegida. Fora do modo admin, pede a senha antes.
async function rpc(fn, args) {
    if (!await requestAdmin()) throw Error('Operação cancelada (sem senha).');

    try {
        return await api('rpc/' + fn, {
            method: 'POST',
            body: JSON.stringify({ p_secret: adminSecret, ...args })
        });
    } catch (err) {
        // A senha mudou no banco enquanto a página estava aberta.
        if (/senha inválida/i.test(err.message)) exitAdmin();
        throw err;
    }
}

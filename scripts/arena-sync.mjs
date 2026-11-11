// Robô da Areninha: importa as partidas de Arena dos jogadores cadastrados (API da Riot)
// e grava as colocações no Supabase. Roda no GitHub Actions (.github/workflows/arena-sync.yml).
//
// Variáveis de ambiente:
//   RIOT_API_KEY    chave da API da Riot (segredo do GitHub)
//   GROUP_PASSWORD  senha do grupo, a mesma do modo admin (segredo do GitHub)
//   SUPABASE_URL, SUPABASE_KEY  mesmos valores de frontend/js/config.js (públicos)
//   ARENA_START     data a partir da qual as Arenas contam (ISO, ex.: 2026-11-11T00:00:00-03:00)
//   ARENA_QUEUES    filas de Arena na API da Riot, separadas por vírgula (padrão: 1700,1710,1740,1750)
//   DRY_RUN=1       só mostra o que faria, sem gravar nada

const env = process.env;

for (const name of ['RIOT_API_KEY', 'SUPABASE_URL', 'SUPABASE_KEY', 'ARENA_START']) {
    if (!env[name]) throw new Error(`Falta a variável ${name}`);
}

const DRY = env.DRY_RUN === '1';

if (!DRY && !env.GROUP_PASSWORD) throw new Error('Falta a variável GROUP_PASSWORD');

const RIOT = 'https://americas.api.riotgames.com';   // contas e partidas do BR ficam em "americas"
const START = Math.floor(Date.parse(env.ARENA_START) / 1000);
const QUEUES = (env.ARENA_QUEUES || '1700,1710,1740,1750').split(',').map(q => q.trim()).filter(Boolean);
const MIN_DURATION_S = 5 * 60;                        // menos que isso: partida inválida, não conta

if (!Number.isFinite(START)) throw new Error('ARENA_START inválida: ' + env.ARENA_START);

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- Supabase ----------
async function sb(path, body) {
    const res = await fetch(env.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/' + path, {
        method: body ? 'POST' : 'GET',
        headers: { apikey: env.SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
    });

    const text = await res.text();
    const data = text ? JSON.parse(text) : null;

    if (!res.ok) throw new Error(`Supabase ${path}: ${(data && data.message) || res.status}`);

    return data;
}

const rpc = (fn, args) => sb('rpc/' + fn, { p_secret: env.GROUP_PASSWORD, ...args });

// ---------- Riot ----------
// Chave pessoal: 20 chamadas/s e 100 a cada 2 min. 1,3 s entre chamadas fica sempre abaixo.
let lastCall = 0;

async function riot(path) {
    for (let attempt = 0; attempt < 4; attempt++) {
        const wait = lastCall + 1300 - Date.now();
        if (wait > 0) await sleep(wait);
        lastCall = Date.now();

        const res = await fetch(RIOT + path, { headers: { 'X-Riot-Token': env.RIOT_API_KEY } });

        if (res.status === 404) return null;

        if (res.status === 429 || res.status >= 500) {
            const retry = Number(res.headers.get('retry-after')) || 10;
            console.log(`  Riot ${res.status}, esperando ${retry}s...`);
            await sleep(retry * 1000);
            continue;
        }

        if (res.status === 401 || res.status === 403) {
            throw new Error(`Riot ${res.status}: chave da API inválida ou expirada (atualize o segredo RIOT_API_KEY)`);
        }

        if (!res.ok) throw new Error(`Riot ${res.status} em ${path}`);

        return res.json();
    }

    throw new Error('Riot: muitas tentativas em ' + path);
}

// "https://op.gg/lol/summoners/br/Nick%20X-BR1" -> { game: "Nick X", tag: "BR1" }
function riotIdFromOpgg(url) {
    if (!url) return null;

    let last = url.split('?')[0].replace(/\/+$/, '').split('/').pop();
    try { last = decodeURIComponent(last); } catch (e) { /* mantém como está */ }

    const dash = last.lastIndexOf('-');
    if (dash < 1) return null;

    return { game: last.slice(0, dash), tag: last.slice(dash + 1) };
}

// ---------- Execução ----------
const players = await sb('players?select=id,name,opgg_url,puuid,puuid_source');
console.log(`${players.length} jogadores cadastrados. Contando Arenas desde ${new Date(START * 1000).toISOString()}${DRY ? ' (DRY_RUN)' : ''}.`);

// 1. PUUID de cada jogador (só consulta a Riot quando o link do op.gg mudou).
for (const p of players) {
    const id = riotIdFromOpgg(p.opgg_url);

    if (!id) {
        if (!p.puuid) console.log(`- ${p.name}: sem Riot ID com tag no op.gg, ignorado`);
        continue;
    }

    const source = `${id.game}#${id.tag}`;
    if (p.puuid && p.puuid_source === source) continue;

    const acc = await riot(`/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(id.game)}/${encodeURIComponent(id.tag)}`);

    if (!acc) {
        console.log(`- ${p.name}: Riot ID ${source} não encontrado (nick mudou? atualize o op.gg no site)`);
        continue;
    }

    try {
        if (!DRY) await rpc('arena_set_puuid', { p_player_id: p.id, p_puuid: acc.puuid, p_source: source });
        p.puuid = acc.puuid;
        console.log(`- ${p.name}: PUUID ${p.puuid_source ? 'atualizado' : 'encontrado'} (${source})`);
    } catch (err) {
        console.log(`- ${p.name}: não foi possível gravar o PUUID: ${err.message}`);
    }
}

const byPuuid = new Map(players.filter(p => p.puuid).map(p => [p.puuid, p]));

// 2. Partidas de Arena de cada um desde o início, que ainda não estão no banco.
const since = new Date(START * 1000).toISOString();
const known = new Set((await sb(`arena_games?select=match_id&played_at=gte.${encodeURIComponent(since)}`)).map(g => g.match_id));
const fresh = new Set();

for (const p of byPuuid.values()) {
    for (const queue of QUEUES) {
        // A Riot devolve no máximo 100 por vez: pagina até acabar (quem joga muito passa disso).
        for (let offset = 0; ; offset += 100) {
            const ids = await riot(`/lol/match/v5/matches/by-puuid/${p.puuid}/ids?startTime=${START}&queue=${queue}&start=${offset}&count=100`) || [];
            for (const id of ids) if (!known.has(id)) fresh.add(id);
            if (ids.length < 100) break;
        }
    }
}

console.log(`${fresh.size} partida(s) nova(s) de Arena.`);

// 3. Detalhes de cada partida nova: colocação dos cadastrados.
let saved = 0;

for (const matchId of fresh) {
    const m = await riot(`/lol/match/v5/matches/${matchId}`);
    if (!m) continue;

    const info = m.info;
    const valid = info.gameMode === 'CHERRY' &&
        (info.endOfGameResult || 'GameComplete') === 'GameComplete' &&
        info.gameDuration >= MIN_DURATION_S;

    const results = info.participants
        .filter(x => byPuuid.has(x.puuid) && x.placement >= 1)
        .map(x => ({ player_id: byPuuid.get(x.puuid).id, placement: x.placement, champion: x.championName }));

    const when = new Date(info.gameStartTimestamp).toISOString();
    const who = results.map(r => `${players.find(p => p.id === r.player_id).name} ${r.placement}º`).join(', ');

    console.log(`  ${matchId} ${when} ${valid ? '' : '(inválida, não conta) '}${who}`);

    if (!DRY) {
        await rpc('arena_ingest', {
            p_match_id: matchId,
            p_played_at: when,
            p_duration: info.gameDuration,
            p_counted: valid,
            p_results: results
        });
    }

    saved++;
}

console.log(`Pronto: ${saved} partida(s) ${DRY ? 'encontrada(s)' : 'gravada(s)'}.`);

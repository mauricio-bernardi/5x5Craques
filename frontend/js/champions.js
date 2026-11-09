// Lista de campeões, retratos e sincronização com o Data Dragon da Riot.

const lanes = ['TOP', 'JG', 'MID', 'ADC', 'SUP'];

// Lista inicial editável.
// Os campeões são agrupados por rotas comuns, não por uma classificação oficial rígida.
const defaults = {
    TOP: [
        'Aatrox', 'Akali', 'Camille', 'Cho\'Gath', 'Darius',
        'Dr. Mundo', 'Fiora', 'Gangplank', 'Garen', 'Gnar',
        'Gwen', 'Illaoi', 'Irelia', 'Jax', 'Jayce',
        'Kennen', 'Kled', 'Malphite', 'Mordekaiser', 'Nasus',
        'Olaf', 'Ornn', 'Pantheon', 'Poppy', 'Quinn',
        'Renekton', 'Riven', 'Rumble', 'Sett', 'Shen',
        'Singed', 'Sion', 'Tahm Kench', 'Teemo', 'Trundle',
        'Tryndamere', 'Urgot', 'Volibear', 'Wukong', 'Yorick',
        'Ambessa', 'K\'Sante', 'Kayle', 'Zaahen'
    ],

    JG: [
        'Amumu', 'Bel\'Veth', 'Briar', 'Diana', 'Ekko',
        'Elise', 'Evelynn', 'Fiddlesticks', 'Gragas', 'Graves',
        'Hecarim', 'Ivern', 'Jarvan IV', 'Karthus', 'Kayn',
        'Kha\'Zix', 'Kindred', 'Lee Sin', 'Lillia', 'Maokai',
        'Master Yi', 'Nidalee', 'Nocturne', 'Nunu e Willump',
        'Rammus', 'Rek\'Sai', 'Rengar', 'Sejuani', 'Shaco',
        'Shyvana', 'Skarner', 'Taliyah', 'Udyr', 'Vi',
        'Viego', 'Warwick', 'Xin Zhao', 'Zac'
    ],

    MID: [
        'Ahri', 'Anivia', 'Annie', 'Aurelion Sol', 'Azir',
        'Cassiopeia', 'Corki', 'Fizz', 'Galio', 'Hwei',
        'Kassadin', 'Katarina', 'LeBlanc', 'Lissandra', 'Lux',
        'Malzahar', 'Naafiri', 'Neeko', 'Orianna', 'Qiyana',
        'Ryze', 'Swain', 'Sylas', 'Syndra', 'Talon',
        'Twisted Fate', 'Veigar', 'Vel\'Koz', 'Vex', 'Viktor',
        'Vladimir', 'Xerath', 'Yasuo', 'Yone', 'Zed',
        'Ziggs', 'Zoe',
        'Akshan', 'Aurora', 'Heimerdinger', 'Mel'
    ],

    ADC: [
        'Aphelios', 'Ashe', 'Caitlyn', 'Draven', 'Ezreal',
        'Jhin', 'Jinx', 'Kai\'Sa', 'Kalista', 'Kog\'Maw',
        'Lucian', 'Miss Fortune', 'Nilah', 'Samira', 'Senna',
        'Sivir', 'Smolder', 'Tristana', 'Twitch', 'Varus',
        'Vayne', 'Xayah', 'Zeri', 'Yunara'
    ],

    SUP: [
        'Alistar', 'Bard', 'Blitzcrank', 'Brand', 'Braum',
        'Janna', 'Karma', 'Leona', 'Lulu', 'Milio',
        'Morgana', 'Nami', 'Nautilus', 'Pyke', 'Rakan',
        'Rell', 'Renata Glasc', 'Seraphine', 'Sona', 'Soraka',
        'Taric', 'Thresh', 'Yuumi', 'Zilean', 'Zyra'
    ]
};

// ---------- Retratos (Data Dragon da Riot) ----------
const ddVersionKey = 'roleta_lol_ddversion';
let ddVersion = '14.24.1';

try {
    ddVersion = localStorage.getItem(ddVersionKey) || ddVersion;
} catch (e) {}

const imgUrl = name =>
    `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/champion/${ddId(name)}.png`;

const ddOverrides = {
    'wukong': 'MonkeyKing',
    'nunu e willump': 'Nunu',
    'nunu & willump': 'Nunu',
    'nunu': 'Nunu',
    'leblanc': 'Leblanc',
    "kha'zix": 'Khazix',
    "cho'gath": 'Chogath',
    "kai'sa": 'Kaisa',
    "vel'koz": 'Velkoz',
    "bel'veth": 'Belveth',
    'renata glasc': 'Renata',
    'renata': 'Renata'
};

function ddId(name) {
    const k = norm(name);

    if (ddOverrides[k]) return ddOverrides[k];

    return name.normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map(p => p[0].toUpperCase() + p.slice(1))
        .join('');
}

function portrait(name) {
    const pic = document.createElement('div');
    pic.className = 'pic';

    const initials = name.replace(/[^A-Za-zÀ-ÿ ]/g, '').split(' ')
        .filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

    pic.textContent = initials;

    const img = new Image();
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.draggable = false;
    img.dataset.champ = name;
    img.src = imgUrl(name);
    img.onerror = () => img.remove();

    pic.append(img);

    return pic;
}

// ---------- Campeões novos (lista oficial da Riot) ----------
// Campeões que existem no jogo mas não estão na lista acima entram aqui automaticamente,
// numa rota escolhida pela classe principal (Atirador → ADC, Suporte → SUP, Mago/Assassino → MID, resto → TOP).
const extraKey = 'roleta_lol_extra';
let extras = { champs: {}, ids: {} };

try {
    const saved = JSON.parse(localStorage.getItem(extraKey) || 'null');
    if (saved && saved.champs && saved.ids) extras = saved;
} catch (e) {}

Object.assign(ddOverrides, extras.ids);

function sourcePools() {
    const pools = {};

    for (const lane of lanes) {
        pools[lane] = [...defaults[lane], ...(extras.champs[lane] || [])];
    }

    return pools;
}

const tagLane = { Marksman: 'ADC', Support: 'SUP', Mage: 'MID', Assassin: 'MID', Tank: 'TOP', Fighter: 'TOP' };

async function syncChampions() {
    const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${ddVersion}/data/pt_BR/champion.json`);
    const data = (await res.json()).data;

    // Compara pelo nome e pelo id (ex.: "Nunu e Willump" = Nunu, "Wukong" = MonkeyKing).
    const knownNames = new Set();
    const knownIds = new Set();

    for (const lane of lanes) {
        for (const n of defaults[lane]) {
            knownNames.add(searchKey(n));
            knownIds.add(searchKey(ddId(n)));
        }
    }

    const next = { champs: {}, ids: {} };

    for (const c of Object.values(data)) {
        next.ids[norm(c.name)] = c.id;

        if (knownNames.has(searchKey(c.name)) || knownIds.has(searchKey(c.id))) {
            continue;
        }

        const lane = tagLane[(c.tags || [])[0]] || 'TOP';
        (next.champs[lane] = next.champs[lane] || []).push(c.name);
    }

    const changed = JSON.stringify(next.champs) !== JSON.stringify(extras.champs);

    extras = next;
    Object.assign(ddOverrides, extras.ids);

    try { localStorage.setItem(extraKey, JSON.stringify(extras)); } catch (e) {}

    if (changed) {
        championCache = null;
        renderPools();
    }
}

// Busca a versão mais recente das imagens e guarda no navegador.
// Só troca as imagens se a versão mudou (normalmente só na primeira visita ou após um patch).
// Chamada pelo main.js, depois que todos os scripts já foram carregados.
function updateDataDragon() {
    return fetch('https://ddragon.leagueoflegends.com/api/versions.json')
        .then(r => r.json())
        .then(v => {
            if (Array.isArray(v) && v[0] && v[0] !== ddVersion) {
                ddVersion = v[0];

                try { localStorage.setItem(ddVersionKey, ddVersion); } catch (e) {}

                for (const img of document.querySelectorAll('.pic img')) {
                    img.src = imgUrl(img.dataset.champ);
                }
            }

            return syncChampions();
        })
        .catch(() => {});
}

// Todos os campeões, sem duplicatas, com as rotas de cada um (calculado uma vez só).
let championCache = null;

function allChampions() {
    if (championCache) return championCache;

    const source = sourcePools();
    const map = new Map();

    for (const lane of lanes) {
        for (const name of source[lane] || []) {
            const k = norm(name);

            if (!k) continue;

            if (!map.has(k)) {
                map.set(k, { key: k, name: name.trim(), lanes: [] });
            }

            const entry = map.get(k);

            if (!entry.lanes.includes(lane)) {
                entry.lanes.push(lane);
            }
        }
    }

    championCache = [...map.values()]
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    for (const c of championCache) c.search = searchKey(c.name);

    return championCache;
}

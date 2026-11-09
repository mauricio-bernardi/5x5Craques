// Configuração do backend e do rating. É o único arquivo que precisa ser editado para conectar ao Supabase.

// ---------- Backend (Supabase) ----------
// Preencha com os dados do seu projeto: Supabase → Project Settings → API
// (Project URL e a chave "anon" / "publishable"). A chave anon é pública por design;
// quem protege a escrita é a senha do grupo, definida no script SQL.
const SUPABASE_URL = 'https://csmddsfprddhhzzohssm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WUdVFDaPBdFy6LvLFY57xg_4fUJWIbp';

const secretKey = 'roleta_lol_secret';
const DEFAULT_RATING = 1000;
const MIN_GAMES = 5; // abaixo disso o jogador aparece apagado no ranking

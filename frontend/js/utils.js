// Funções utilitárias usadas por todos os outros arquivos.

const $ = id => document.getElementById(id);

const norm = s => s.trim().toLocaleLowerCase('pt-BR');

// Chave de pesquisa: ignora acentos, espaços, apóstrofos e pontos ("khazix" acha "Kha'Zix").
const searchKey = s => s.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

function shuffle(arr) {
    const a = [...arr];

    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [a[i], a[j]] = [a[j], a[i]];
    }

    return a;
}

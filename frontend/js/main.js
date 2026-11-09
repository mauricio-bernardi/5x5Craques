// Inicialização da página. Precisa ser o último script carregado.

for (const id of ['team1', 'team2']) {
    $(id).addEventListener('input', () => {
        save();

        for (let i = 0; i < 2; i++) {
            const t = $('resultTitle' + i);
            if (t) t.textContent = teamTitle(i);
        }

        if (playerTeams && !spinning) {
            $('pteamName1').textContent = '🔵 ' + teamTitle(0);
            $('pteamName2').textContent = '🔴 ' + teamTitle(1);
            updateResultButtons();
        }
    });
}

load();
draw();
refreshRanking();
restoreUnlock();
updateDataDragon();

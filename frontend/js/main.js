// Inicialização da página. Precisa ser o último script carregado.

for (const id of ['team1', 'team2']) {
    const input = $(id);

    input.addEventListener('input', () => {
        save();

        if (playerTeams && !spinning) updateResultButtons();
    });

    // Enter confirma o nome; nome vazio volta ao padrão.
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === 'Escape') input.blur();
    });

    input.addEventListener('blur', () => {
        if (!input.value.trim()) {
            input.value = id === 'team1' ? 'Time 1' : 'Time 2';
            save();
        }
    });
}

load();
updatePlayersCount();
updateResultButtons();
setPlayersOpen(!playerTeams);
draw();
refreshRanking();
updateDataDragon();

uiReady = true;

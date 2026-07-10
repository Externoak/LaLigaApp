// Mapeo compartido entre las claves de formación del API de alineaciones
// (goalkeeper/defender/midfield/striker) y los positionId de fantasy (1-4).
export const FORMATION_POSITION_IDS = {
    goalkeeper: 1,
    defender: 2,
    midfield: 3,
    striker: 4,
};

/**
 * Aplana un objeto indexado por posición ({ goalkeeper: [...], defender:
 * [...], ... }) a una lista de jugadores anotados con positionId y
 * originalPosition. Ignora claves cuyo valor no sea un array (p. ej.
 * tacticalFormation) y asigna portero (1) a posiciones desconocidas, igual
 * que hacía el código original de Lineup.
 */
export const flattenPositionKeyedPlayers = (positionKeyed) => {
    const players = [];
    if (!positionKeyed || typeof positionKeyed !== 'object') return players;

    Object.entries(positionKeyed).forEach(([position, playersList]) => {
        if (!Array.isArray(playersList)) return;
        const positionId = FORMATION_POSITION_IDS[position] ?? 1;
        players.push(...playersList.map((player) => ({
            ...player,
            positionId,
            originalPosition: position,
        })));
    });
    return players;
};

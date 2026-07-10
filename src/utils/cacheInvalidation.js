/**
 * Utilidades centralizadas para invalidación de caché después de mutaciones
 * Esto asegura que los datos se actualicen correctamente cuando cambian propietarios,
 * se realizan operaciones de mercado, etc.
 *
 * IMPORTANTE: Usamos refetchQueries en lugar de invalidateQueries para forzar
 * la recarga inmediata de los datos, evitando que se muestren datos antiguos en caché.
 * `type: 'active'` va dentro del objeto de filtros (React Query v5); solo se
 * refrescan las queries montadas, el resto se recarga al montarse.
 */

// Las dos vistas de actividad usan claves distintas: el widget del Dashboard
// ['activity', leagueId] y la página completa ['activityInfinite', leagueId].
const activityFilters = (leagueId) => [
  { queryKey: ['activity', leagueId] },
  { queryKey: ['activityInfinite', leagueId] },
];

const refetchAll = (queryClient, filters) =>
  Promise.all(
    filters.map((filter) => queryClient.refetchQueries({ ...filter, type: 'active' }))
  );

/**
 * Invalida todas las queries relacionadas con operaciones de mercado
 * Usar después de: pujas, ventas, compras, ofertas, etc.
 */
export const invalidateMarketData = async (queryClient, leagueId) => {
  await refetchAll(queryClient, [
    { queryKey: ['market', leagueId] },           // Datos del mercado
    { queryKey: ['standings', leagueId] },        // Clasificación (puntos, dinero pueden cambiar)
    { queryKey: ['allPlayers'] },                 // Jugadores (propietarios cambian)
    ...activityFilters(leagueId),
  ]);
};

/**
 * Invalida queries relacionadas con el dinero del equipo
 * Usar después de: compras, ventas, pujas que cambian el dinero disponible
 */
export const invalidateTeamMoney = async (queryClient, teamId) => {
  await refetchAll(queryClient, [{ queryKey: ['teamMoney', teamId] }]);
};

/**
 * Invalida queries relacionadas con un equipo específico
 * Usar después de: cambios en alineación, fichajes, ventas
 */
export const invalidateTeamData = async (queryClient, leagueId, teamId) => {
  await refetchAll(queryClient, [
    { queryKey: ['teamData', leagueId, teamId] },
    { queryKey: ['teamMoney', teamId] },
    { queryKey: ['standings', leagueId] },
    ...activityFilters(leagueId),
  ]);
};

/**
 * Invalida todo después de una operación de cláusula (compra importante)
 * Usar después de: activar cláusula de rescisión
 */
export const invalidateAfterClausePurchase = async (queryClient, leagueId, buyerTeamId, sellerTeamId) => {
  await refetchAll(queryClient, [
    { queryKey: ['market', leagueId] },
    { queryKey: ['standings', leagueId] },
    { queryKey: ['allPlayers'] },                 // Propietarios cambian
    { queryKey: ['teamMoney', buyerTeamId] },
    { queryKey: ['teamMoney', sellerTeamId] },
    { queryKey: ['teamData', leagueId, buyerTeamId] },
    { queryKey: ['teamData', leagueId, sellerTeamId] },
    { queryKey: ['allTeamsData', leagueId] },     // Para RecentActivity (cláusulas)
    ...activityFilters(leagueId),
  ]);
};

/**
 * Invalida después de aceptar/rechazar una oferta
 * Usar después de: acceptOffer, declineOffer
 */
export const invalidateAfterOfferResponse = async (queryClient, leagueId, teamId) => {
  await refetchAll(queryClient, [
    { queryKey: ['market', leagueId] },
    { queryKey: ['allPlayers'] },                 // Propietarios pueden cambiar
    { queryKey: ['teamMoney', teamId] },
    { queryKey: ['standings', leagueId] },
    { queryKey: ['allTeamsData', leagueId] },
    ...activityFilters(leagueId),
  ]);
};

/**
 * Invalida después de hacer/modificar/cancelar una puja
 * Solo afecta al mercado, no cambia propietarios
 */
export const invalidateAfterBid = async (queryClient, leagueId) => {
  await refetchAll(queryClient, [{ queryKey: ['market', leagueId] }]);
};

/**
 * Invalida después de poner/retirar un jugador del mercado
 */
export const invalidateAfterMarketListing = async (queryClient, leagueId, teamId) => {
  await refetchAll(queryClient, [
    { queryKey: ['market', leagueId] },
    { queryKey: ['teamData', leagueId, teamId] },
    ...activityFilters(leagueId),
  ]);
};

/**
 * Utilidades centralizadas para invalidación de caché después de mutaciones
 * Esto asegura que los datos se actualicen correctamente cuando cambian propietarios,
 * se realizan operaciones de mercado, etc.
 *
 * IMPORTANTE: Usamos refetchQueries en lugar de invalidateQueries para forzar
 * la recarga inmediata de los datos, evitando que se muestren datos antiguos en caché
 */

/**
 * Invalida todas las queries relacionadas con operaciones de mercado
 * Usar después de: pujas, ventas, compras, ofertas, etc.
 */
export const invalidateMarketData = async (queryClient, leagueId) => {
  const queriesToInvalidate = [
    { queryKey: ['market', leagueId] },           // Datos del mercado
    { queryKey: ['standings', leagueId] },        // Clasificación (puntos, dinero pueden cambiar)
    { queryKey: ['allPlayers'] },                 // Jugadores (propietarios cambian)
    { queryKey: ['allActivity', leagueId] },      // Actividad de la liga
  ];

  // Invalidar Y refetch para forzar actualización inmediata
  await Promise.all(
    queriesToInvalidate.map(query =>
      queryClient.refetchQueries(query, { type: 'active' })
    )
  );
};

/**
 * Invalida queries relacionadas con el dinero del equipo
 * Usar después de: compras, ventas, pujas que cambian el dinero disponible
 */
export const invalidateTeamMoney = async (queryClient, teamId) => {
  await queryClient.refetchQueries({ queryKey: ['teamMoney', teamId] }, { type: 'active' });
};

/**
 * Invalida queries relacionadas con un equipo específico
 * Usar después de: cambios en alineación, fichajes, ventas
 */
export const invalidateTeamData = async (queryClient, leagueId, teamId) => {
  const queriesToInvalidate = [
    { queryKey: ['teamData', leagueId, teamId] },
    { queryKey: ['teamMoney', teamId] },
    { queryKey: ['standings', leagueId] },
    { queryKey: ['allActivity', leagueId] },
  ];

  await Promise.all(
    queriesToInvalidate.map(query => queryClient.refetchQueries(query, { type: 'active' }))
  );
};

/**
 * Invalida todo después de una operación de cláusula (compra importante)
 * Usar después de: activar cláusula de rescisión
 */
export const invalidateAfterClausePurchase = async (queryClient, leagueId, buyerTeamId, sellerTeamId) => {
  const queriesToInvalidate = [
    { queryKey: ['market', leagueId] },
    { queryKey: ['standings', leagueId] },
    { queryKey: ['allPlayers'] },                 // Propietarios cambian
    { queryKey: ['teamMoney', buyerTeamId] },
    { queryKey: ['teamMoney', sellerTeamId] },
    { queryKey: ['teamData', leagueId, buyerTeamId] },
    { queryKey: ['teamData', leagueId, sellerTeamId] },
    { queryKey: ['allActivity', leagueId] },
    { queryKey: ['allTeamsData', leagueId] },     // Para Activity component
  ];

  await Promise.all(
    queriesToInvalidate.map(query => queryClient.refetchQueries(query, { type: 'active' }))
  );
};

/**
 * Invalida después de aceptar/rechazar una oferta
 * Usar después de: acceptOffer, declineOffer
 */
export const invalidateAfterOfferResponse = async (queryClient, leagueId, teamId) => {
  const queriesToInvalidate = [
    { queryKey: ['market', leagueId] },
    { queryKey: ['allPlayers'] },                 // Propietarios pueden cambiar
    { queryKey: ['teamMoney', teamId] },
    { queryKey: ['standings', leagueId] },
    { queryKey: ['allActivity', leagueId] },
    { queryKey: ['allTeamsData', leagueId] },
  ];

  await Promise.all(
    queriesToInvalidate.map(query => queryClient.refetchQueries(query, { type: 'active' }))
  );
};

/**
 * Invalida después de hacer/modificar/cancelar una puja
 * Solo afecta al mercado, no cambia propietarios
 */
export const invalidateAfterBid = async (queryClient, leagueId) => {
  await queryClient.refetchQueries({ queryKey: ['market', leagueId] }, { type: 'active' });
};

/**
 * Invalida después de poner/retirar un jugador del mercado
 */
export const invalidateAfterMarketListing = async (queryClient, leagueId, teamId) => {
  const queriesToInvalidate = [
    { queryKey: ['market', leagueId] },
    { queryKey: ['teamData', leagueId, teamId] },
    { queryKey: ['allActivity', leagueId] },
  ];

  await Promise.all(
    queriesToInvalidate.map(query => queryClient.refetchQueries(query, { type: 'active' }))
  );
};

import teamService from './teamService';

// Regresión: cancelar una puja y recargar el mercado (posiblemente servido
// desde caché HTTP con la puja aún dentro) no debe re-añadir la oferta — el
// botón Modificar/Cancelar reaparecía en la tarjeta del mercado.

const marketItemWithBid = (playerId, bidId = 'bid-1', money = 1000000) => ({
    discr: 'marketPlayerLeague',
    bid: { id: bidId, money, status: 'pending' },
    playerMaster: { id: playerId, nickname: 'Jugador Test' },
});

describe('teamService bids: cancelación vs recarga del mercado', () => {
    beforeEach(() => {
        teamService.userTeamId = 'team-1';
        teamService.userOffers.clear();
        teamService.recentlyCanceled.clear();
    });

    afterAll(() => {
        teamService.userTeamId = undefined;
        teamService.userOffers.clear();
        teamService.recentlyCanceled.clear();
    });

    test('una puja recién cancelada no se re-añade desde datos de mercado obsoletos', async () => {
        teamService.addOffer('p1', 1000000, 'Jugador Test', 'bid-1');
        expect(teamService.hasOffer('p1')).toBe(true);

        // Cancelación local (lo que hace cancelBid tras el DELETE de la API)
        teamService.removeOffer('p1');
        expect(teamService.hasOffer('p1')).toBe(false);

        // El mercado refetcheado aún contiene la puja (caché HTTP / API con retraso)
        await teamService.loadExistingBids('league-1', [marketItemWithBid('p1')]);

        expect(teamService.hasOffer('p1')).toBe(false);
    });

    test('una puja nueva tras cancelar limpia la marca y sobrevive a la recarga', async () => {
        teamService.addOffer('p1', 1000000, 'Jugador Test', 'bid-1');
        teamService.removeOffer('p1');

        // El usuario vuelve a pujar por el mismo jugador
        teamService.addOffer('p1', 1200000, 'Jugador Test', 'bid-2');
        expect(teamService.hasOffer('p1')).toBe(true);

        await teamService.loadExistingBids('league-1', [marketItemWithBid('p1', 'bid-2', 1200000)]);

        expect(teamService.hasOffer('p1')).toBe(true);
        expect(teamService.getOfferAmount('p1')).toBe(1200000);
    });

    test('las pujas de otros jugadores se siguen cargando con normalidad', async () => {
        teamService.removeOffer('p1'); // p1 cancelado

        await teamService.loadExistingBids('league-1', [
            marketItemWithBid('p1'),
            marketItemWithBid('p2', 'bid-9', 500000),
        ]);

        expect(teamService.hasOffer('p1')).toBe(false);
        expect(teamService.hasOffer('p2')).toBe(true);
    });
});

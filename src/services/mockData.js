// Mock data for development and testing
export const mockData = {
  leagues: [
    {
      id: '1',
      name: 'Liga Demo - Amigos',
      description: 'Liga privada entre amigos',
      type: 'private',
      maxTeams: 12,
      currentTeams: 8,
      startDate: '2024-08-01T00:00:00Z',
      status: 'active'
    },
    {
      id: '2', 
      name: 'Liga Pública España',
      description: 'Liga pública abierta a todos',
      type: 'public',
      maxTeams: 1000,
      currentTeams: 847,
      startDate: '2024-08-01T00:00:00Z',
      status: 'active'
    }
  ],

  ranking: {
    elements: [
      {
        id: 't1',
        name: 'Los Galácticos',
        manager: 'Juan Pérez',
        points: 1247,
        position: 1,
        userId: 'user1'
      },
      {
        id: 't2',
        name: 'Barça Forever',
        manager: 'María García',
        points: 1189,
        position: 2,
        userId: 'user2'
      },
      {
        id: 't3',
        name: 'Atleti Legends',
        manager: 'Carlos López',
        points: 1156,
        position: 3,
        userId: 'user3'
      }
    ]
  },

  players: [
    {
      id: 'p1',
      name: 'Karim Benzema',
      team: 'Real Madrid',
      position: 'Delantero',
      positionId: 4,
      marketValue: 25000000,
      points: 187,
      image: null
    },
    {
      id: 'p2',
      name: 'Robert Lewandowski',
      team: 'FC Barcelona',
      position: 'Delantero',
      positionId: 4,
      marketValue: 23000000,
      points: 176,
      image: null
    },
    {
      id: 'p3',
      name: 'Luka Modric',
      team: 'Real Madrid',
      position: 'Centrocampista',
      positionId: 3,
      marketValue: 15000000,
      points: 143,
      image: null
    },
    {
      id: 'p4',
      name: 'Pedri',
      team: 'FC Barcelona',
      position: 'Centrocampista',
      positionId: 3,
      marketValue: 18000000,
      points: 134,
      image: null
    },
    {
      id: 'p5',
      name: 'Thibaut Courtois',
      team: 'Real Madrid',
      position: 'Portero',
      positionId: 1,
      marketValue: 12000000,
      points: 125,
      image: null
    }
  ],

  market: {
    elements: [
      {
        id: 'm1',
        playerId: 'p1',
        playerMaster: {
          id: 'p1',
          name: 'Karim Benzema',
          nickname: 'Benzema',
          team: 'Real Madrid',
          positionId: 4,
          marketValue: 25000000,
          points: 187
        },
        salePrice: 20000000,
        expirationDate: '2024-12-31T23:59:59Z',
        teamOwner: 'Los Galácticos'
      },
      {
        id: 'm2',
        playerId: 'p3',
        playerMaster: {
          id: 'p3',
          name: 'Luka Modric',
          nickname: 'Modric',
          team: 'Real Madrid',
          positionId: 3,
          marketValue: 15000000,
          points: 143
        },
        salePrice: 12000000,
        expirationDate: '2024-12-31T23:59:59Z',
        teamOwner: 'Barça Forever'
      }
    ]
  },

  activity: [
    {
      id: 'a1',
      type: 'market',
      description: 'Juan Pérez ha puesto en venta a Karim Benzema por 20M€',
      timestamp: '2024-08-26T08:30:00Z',
      player: 'Karim Benzema',
      team: 'Los Galácticos'
    },
    {
      id: 'a2',
      type: 'transfer',
      description: 'María García ha fichado a Luka Modric por 12M€',
      timestamp: '2024-08-26T07:15:00Z',
      player: 'Luka Modric',
      team: 'Barça Forever'
    }
  ],

  lineup: {
    formation: '4-3-3',
    players: [
      {
        id: 'p5',
        name: 'Thibaut Courtois',
        positionId: 1,
        lineupPosition: 1,
        points: 125
      },
      {
        id: 'p6',
        name: 'Dani Carvajal',
        positionId: 2,
        lineupPosition: 1,
        points: 89
      },
      {
        id: 'p7',
        name: 'Eder Militao',
        positionId: 2,
        lineupPosition: 2,
        points: 92
      },
      {
        id: 'p8',
        name: 'David Alaba',
        positionId: 2,
        lineupPosition: 3,
        points: 87
      },
      {
        id: 'p9',
        name: 'Ferland Mendy',
        positionId: 2,
        lineupPosition: 4,
        points: 81
      },
      {
        id: 'p3',
        name: 'Luka Modric',
        positionId: 3,
        lineupPosition: 1,
        points: 143
      },
      {
        id: 'p10',
        name: 'Casemiro',
        positionId: 3,
        lineupPosition: 2,
        points: 116
      },
      {
        id: 'p11',
        name: 'Toni Kroos',
        positionId: 3,
        lineupPosition: 3,
        points: 121
      },
      {
        id: 'p12',
        name: 'Vinicius Jr',
        positionId: 4,
        lineupPosition: 1,
        points: 152
      },
      {
        id: 'p1',
        name: 'Karim Benzema',
        positionId: 4,
        lineupPosition: 2,
        points: 187
      },
      {
        id: 'p13',
        name: 'Marco Asensio',
        positionId: 4,
        lineupPosition: 3,
        points: 98
      }
    ]
  },

  currentWeek: {
    weekNumber: 8
  },

  matches: [
    {
      id: 'match1',
      homeTeam: 'Real Madrid',
      awayTeam: 'FC Barcelona',
      date: '2024-08-26T16:00:00Z',
      week: 8,
      homeScore: 2,
      awayScore: 1,
      status: 'finished'
    },
    {
      id: 'match2',
      homeTeam: 'Atlético Madrid',
      awayTeam: 'Sevilla FC',
      date: '2024-08-26T18:30:00Z',
      week: 8,
      homeScore: null,
      awayScore: null,
      status: 'scheduled'
    }
  ]
};

export default mockData;
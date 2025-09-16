import { fantasyAPI } from './api';

class PlayerOwnershipService {
  constructor() {
    this.ownershipData = new Map(); // playerId -> { ownerName, teamId, teamName }
    this.teamPlayersCache = new Map(); // teamId -> { players: [], managerName: '', lastFetch: timestamp }
    this.isInitialized = false;
    this.lastUpdate = null;
    this.cacheValidityTime = 10 * 60 * 1000; // 10 minutes
    this.currentLeagueId = null;
  }

  // Initialize with efficient caching strategy
  async initialize(leagueId) {
    if (!leagueId) {
      return { success: false, error: 'No league ID' };
    }

    // Skip if already initialized for this league and cache is fresh
    if (this.isInitialized && this.currentLeagueId === leagueId && !this.needsUpdate()) {
            return { success: true, fromCache: true, playersFound: this.ownershipData.size };
    }

    try {
            this.currentLeagueId = leagueId;
      
      // Step 1: Get ranking data (already cached by other components)
      const rankingResponse = await fantasyAPI.getLeagueRanking(leagueId);
      const teams = this.extractTeamsFromRanking(rankingResponse);
      
            
      // Step 2: Get market data for immediate ownership info
      await this.loadMarketOwnership(leagueId);
      
      // Step 3: Only fetch team details for teams we don't have cached
      const teamsToFetch = teams.filter(team => {
        const teamId = team.id || team.team?.id;
        const cached = this.teamPlayersCache.get(teamId);
        return !cached || (Date.now() - cached.lastFetch > this.cacheValidityTime);
      });

            
      // Step 4: Fetch missing team data efficiently
      if (teamsToFetch.length > 0) {
        await this.fetchTeamPlayersOptimized(leagueId, teamsToFetch);
      }
      
      // Step 5: Build ownership map from cached data
      this.buildOwnershipMap(teams);

      this.isInitialized = true;
      this.lastUpdate = Date.now();

      
      return {
        success: true,
        teamsProcessed: teams.length,
        totalTeams: teams.length,
        playersFound: this.ownershipData.size
      };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Extract teams from ranking response
  extractTeamsFromRanking(rankingResponse) {
    let teams = [];
    if (rankingResponse?.data?.elements && Array.isArray(rankingResponse.data.elements)) {
      teams = rankingResponse.data.elements;
    } else if (rankingResponse?.data && Array.isArray(rankingResponse.data)) {
      teams = rankingResponse.data;
    } else if (Array.isArray(rankingResponse)) {
      teams = rankingResponse;
    }
    
    return teams.map(item => ({
      id: item.id || item.team?.id,
      name: item.name || item.team?.name || 'Team',
      managerName: item.manager?.managerName || item.team?.manager?.managerName || 'Unknown Manager',
      managerId: item.manager?.id || item.team?.manager?.id
    })).filter(team => team.id); // Only keep teams with valid IDs
  }

  // Load ownership info from market data
  async loadMarketOwnership(leagueId) {
    try {
            const marketResponse = await fantasyAPI.getMarket(leagueId);
      
      let marketArray = [];
      if (Array.isArray(marketResponse)) {
        marketArray = marketResponse;
      } else if (marketResponse?.data && Array.isArray(marketResponse.data)) {
        marketArray = marketResponse.data;
      } else if (marketResponse?.elements && Array.isArray(marketResponse.elements)) {
        marketArray = marketResponse.elements;
      }

      marketArray.forEach(item => {
        if (item.playerMaster?.id && item.ownerName) {
          this.ownershipData.set(item.playerMaster.id, {
            ownerName: item.ownerName,
            teamId: null, // Market data doesn't provide team ID
            teamName: item.ownerName,
            playerId: item.playerMaster.id,
            source: 'market'
          });
        }
      });

          } catch (error) {
    }
  }

  // Fetch team players with batching and optimization
  async fetchTeamPlayersOptimized(leagueId, teams) {
        
    // Process in small batches to avoid overwhelming the API
    const batchSize = 3;
    for (let i = 0; i < teams.length; i += batchSize) {
      const batch = teams.slice(i, i + batchSize);
      const promises = batch.map(team => this.fetchSingleTeamPlayers(leagueId, team));
      
      await Promise.allSettled(promises);
      
      // Small delay between batches
      if (i + batchSize < teams.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  // Fetch players for a single team
  async fetchSingleTeamPlayers(leagueId, team) {
    try {
      const teamData = await fantasyAPI.getTeamData(leagueId, team.id);
      
      let players = [];
      if (teamData?.players && Array.isArray(teamData.players)) {
        players = teamData.players;
      } else if (teamData?.data?.players && Array.isArray(teamData.data.players)) {
        players = teamData.data.players;
      }

      // Cache the result
      this.teamPlayersCache.set(team.id, {
        players: players.map(p => ({
          id: p.playerMaster?.id || p.id,
          name: p.playerMaster?.name || p.name,
          nickname: p.playerMaster?.nickname || p.nickname
        })),
        managerName: team.managerName,
        managerId: team.managerId,
        lastFetch: Date.now()
      });

      return { success: true, playerCount: players.length };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Build ownership map from cached team data
  buildOwnershipMap(teams) {
    this.ownershipData.clear();
    
    // First, add market data again
    this.loadMarketOwnership(this.currentLeagueId).catch(() => {});
    
    // Then add team data
    teams.forEach(team => {
      const cached = this.teamPlayersCache.get(team.id);
      if (cached && cached.players) {
        cached.players.forEach(player => {
          if (player.id) {
            // Only override if we don't have market data for this player
            if (!this.ownershipData.has(player.id)) {
              this.ownershipData.set(player.id, {
                ownerName: cached.managerName,
                teamId: team.id,
                teamName: team.name,
                playerId: player.id,
                source: 'team'
              });
            }
          }
        });
      }
    });
    
      }

  // Method to get player ownership on-demand (avoids duplicate calls)
  async getPlayerOwnershipLazy(playerId, leagueId) {
    // If we have cached data, return it
    if (this.ownershipData.has(playerId)) {
      return this.ownershipData.get(playerId);
    }

    // If service isn't initialized, initialize it
    if (!this.isInitialized || this.currentLeagueId !== leagueId) {
            await this.initialize(leagueId);
    }

    return this.ownershipData.get(playerId) || null;
  }

  // Clear cache for a specific league
  clearCache(leagueId = null) {
    if (leagueId && leagueId !== this.currentLeagueId) {
      return; // Don't clear cache for different league
    }
    
    this.ownershipData.clear();
    this.teamPlayersCache.clear();
    this.isInitialized = false;
      }

  // Obtener el propietario de un jugador
  getPlayerOwner(playerId) {
    if (!this.isInitialized || !playerId) {
      return null;
    }

    return this.ownershipData.get(playerId) || null;
  }

  // Verificar si los datos están actualizados
  needsUpdate() {
    if (!this.isInitialized || !this.lastUpdate) {
      return true;
    }
    
    return Date.now() - this.lastUpdate > this.cacheValidityTime;
  }

  // Refrescar datos si es necesario
  async refreshIfNeeded(leagueId) {
    if (this.needsUpdate()) {
            return await this.initialize(leagueId);
    }
    
    return { success: true, fromCache: true };
  }

  // Obtener estadísticas del servicio
  getStats() {
    return {
      isInitialized: this.isInitialized,
      playersTracked: this.ownershipData.size,
      lastUpdate: this.lastUpdate,
      needsUpdate: this.needsUpdate()
    };
  }

  // Buscar jugadores por propietario
  getPlayersByOwner(ownerName) {
    if (!this.isInitialized) {
      return [];
    }

    const players = [];
    for (const [playerId, ownership] of this.ownershipData.entries()) {
      if (ownership.ownerName === ownerName) {
        players.push({
          playerId,
          ...ownership
        });
      }
    }

    return players;
  }

  // Obtener todos los propietarios únicos
  getAllOwners() {
    if (!this.isInitialized) {
      return [];
    }

    const owners = new Set();
    for (const ownership of this.ownershipData.values()) {
      owners.add(ownership.ownerName);
    }

    return Array.from(owners).sort();
  }
}

// Crear instancia singleton
const playerOwnershipService = new PlayerOwnershipService();

export default playerOwnershipService;

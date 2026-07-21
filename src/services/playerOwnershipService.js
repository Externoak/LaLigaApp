import { fantasyAPI } from './api';
import { fetchAllTeamsData, extractTeamPlayers } from '../utils/fetchAllTeamsData';
import { queryClient } from '../utils/queryClient';
import { extractArray } from '../utils/helpers';

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

    // Concurrent callers for the same league share the in-flight promise.
    if (this._initPromise && this._initLeagueId === leagueId) {
      return this._initPromise;
    }
    this._initLeagueId = leagueId;
    this._initPromise = this._doInitialize(leagueId).finally(() => {
      this._initPromise = null;
    });
    return this._initPromise;
  }

  async _doInitialize(leagueId) {
    try {
            this.currentLeagueId = leagueId;
      
      // Step 1: Get ranking data (already cached by other components)
      const rankingResponse = await fantasyAPI.getLeagueRanking(leagueId);
      const teams = this.extractTeamsFromRanking(rankingResponse);
      
            
      // Step 2: Get market data for immediate ownership info
      await this.loadMarketOwnership(leagueId);
      
      // Steps 3-4: plantillas vía la caché compartida ['teamData'] con
      // concurrencia limitada — mismo camino que Cláusulas/Clasificación,
      // así que navegar entre vistas no repite el walk. La frescura la
      // gestiona React Query (staleTime), no una caché privada.
      const teamsData = await fetchAllTeamsData(queryClient, leagueId, teams, {
        staleTime: this.cacheValidityTime,
      });
      for (const [teamId, { teamData, entry: team }] of teamsData) {
        const players = extractTeamPlayers(teamData);
        this.teamPlayersCache.set(teamId, {
          players: players.map(p => ({
            id: p.playerMaster?.id || p.id,
            name: p.playerMaster?.name || p.name,
            nickname: p.playerMaster?.nickname || p.nickname,
            // El propio registro de plantilla ya trae el manager: es más fiable
            // que el de la clasificación (que en pretemporada puede faltar).
            managerName: p.manager?.managerName ?? null,
            managerId: p.managerId ?? p.manager?.id ?? null,
            // Cláusula del jugador (para el badge/estado en Equipos de La Liga).
            buyoutClause: p.buyoutClause ?? null,
            buyoutClauseLockedEndTime: p.buyoutClauseLockedEndTime ?? null,
            isShielded: p.isShielded ?? false,
          })),
          managerName: team.managerName,
          managerId: team.managerId,
          lastFetch: Date.now()
        });
      }

      // Step 5: Build ownership map from cached data
      this.buildOwnershipMap(teams);

      // Diagnóstico: si tras recorrer las plantillas el mapa queda vacío, el
      // fallo está en la enumeración (clasificación) o en el walk, NO en la
      // tarjeta. Se registra solo cuando el resultado es sospechoso.
      if (teams.length === 0 || this.ownershipData.size === 0) {
        // eslint-disable-next-line no-console
        console.warn('[ownership] resultado sospechoso:', {
          equiposEnClasificacion: teams.length,
          plantillasObtenidas: teamsData.size,
          jugadoresConDueno: this.ownershipData.size,
        });
      }

      this.isInitialized = true;
      this.lastUpdate = Date.now();

      
      return {
        success: true,
        teamsProcessed: teams.length,
        totalTeams: teams.length,
        playersFound: this.ownershipData.size
      };

    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[ownership] initialize falló:', error.message);
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
      const marketArray = extractArray(marketResponse);

      marketArray.forEach(item => {
        if (item.playerMaster?.id != null && item.ownerName) {
          const key = String(item.playerMaster.id);
          this.ownershipData.set(key, {
            ownerName: item.ownerName,
            teamId: null, // Market data doesn't provide team ID
            teamName: item.ownerName,
            playerId: key,
            source: 'market'
          });
        }
      });

          } catch (error) {
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
          if (player.id != null) {
            // Clave SIEMPRE String: el feed /players busca con id string ("68")
            // pero la plantilla puede traer playerMaster.id con otro tipo. Sin
            // esta coacción el Map.get() del feed fallaba y TODO jugador con
            // dueño salía como "Libre" en la tarjeta.
            const key = String(player.id);
            // Only override if we don't have market data for this player
            if (!this.ownershipData.has(key)) {
              this.ownershipData.set(key, {
                ownerName: player.managerName || cached.managerName,
                teamId: team.id,
                teamName: team.name,
                playerId: key,
                buyoutClause: player.buyoutClause,
                buyoutClauseLockedEndTime: player.buyoutClauseLockedEndTime,
                isShielded: player.isShielded,
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
    const key = playerId != null ? String(playerId) : null;
    // If we have cached data, return it
    if (key && this.ownershipData.has(key)) {
      return this.ownershipData.get(key);
    }

    // If service isn't initialized, initialize it
    if (!this.isInitialized || this.currentLeagueId !== leagueId) {
            await this.initialize(leagueId);
    }

    return (key && this.ownershipData.get(key)) || null;
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
    if (!this.isInitialized || playerId == null) {
      return null;
    }

    return this.ownershipData.get(String(playerId)) || null;
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

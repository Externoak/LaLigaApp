import { fantasyAPI } from '../services/api';

// Utility to automatically fallback to mock data in development when real API fails
export const apiWithFallback = {
  async getLeagues() {
    if (process.env.NODE_ENV === 'development') {
      try {
        return await fantasyAPI.getLeagues();
      } catch (error) {
        return await fantasyAPI.getLeaguesPublicTest();
      }
    }
    return await fantasyAPI.getLeagues();
  },

  async getLeagueRanking(leagueId) {
    if (process.env.NODE_ENV === 'development') {
      try {
        return await fantasyAPI.getLeagueRanking(leagueId);
      } catch (error) {
        return await fantasyAPI.getLeagueRankingMock();
      }
    }
    return await fantasyAPI.getLeagueRanking(leagueId);
  },

  async getMarket(leagueId) {
    if (process.env.NODE_ENV === 'development') {
      try {
        return await fantasyAPI.getMarket(leagueId);
      } catch (error) {
        return await fantasyAPI.getMarketMock();
      }
    }
    return await fantasyAPI.getMarket(leagueId);
  },

  async getAllPlayers() {
    if (process.env.NODE_ENV === 'development') {
      try {
        return await fantasyAPI.getAllPlayers();
      } catch (error) {
        return await fantasyAPI.getAllPlayersMock();
      }
    }
    return await fantasyAPI.getAllPlayers();
  },

  async getTeamLineup(teamId, week) {
    if (process.env.NODE_ENV === 'development') {
      try {
        return await fantasyAPI.getTeamLineup(teamId, week);
      } catch (error) {
        return await fantasyAPI.getTeamLineupMock();
      }
    }
    return await fantasyAPI.getTeamLineup(teamId, week);
  },

  async getCurrentWeek() {
    if (process.env.NODE_ENV === 'development') {
      try {
        return await fantasyAPI.getCurrentWeek();
      } catch (error) {
        return await fantasyAPI.getCurrentWeekMock();
      }
    }
    return await fantasyAPI.getCurrentWeek();
  },

  async getMatchday(weekNumber) {
    if (process.env.NODE_ENV === 'development') {
      try {
        return await fantasyAPI.getMatchday(weekNumber);
      } catch (error) {
        return await fantasyAPI.getMatchdayMock();
      }
    }
    return await fantasyAPI.getMatchday(weekNumber);
  },

  async getLeagueActivity(leagueId, index = 0) {
    if (process.env.NODE_ENV === 'development') {
      try {
        return await fantasyAPI.getLeagueActivity(leagueId, index);
      } catch (error) {
        return await fantasyAPI.getLeagueActivityMock();
      }
    }
    return await fantasyAPI.getLeagueActivity(leagueId, index);
  }
};

export default apiWithFallback;
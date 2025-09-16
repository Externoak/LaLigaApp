/**
 * Team Service - Manages user team data, money, and offers
 */

import { fantasyAPI } from './api';

class TeamService {
  constructor() {
    this.teamData = null;
    this.teamMoney = null;
    this.userOffers = new Map(); // Track user's current bids
    this.recentlyCanceled = new Map(); // Track recently canceled bids to prevent re-adding
    this.lastUpdate = null;
  }

  /**
   * Initialize team service with league and user data
   */
  async initialize(leagueId, user) {
    try {
      if (!leagueId) {
        throw new Error('League ID is required');
      }
      
      if (!user) {
        throw new Error('User is required');
      }
      
      // Check for userId, id, sub, or oid property
      const userId = user.userId || user.id || user.sub || user.oid;
      if (!userId) {
        throw new Error('User ID is required (missing userId, id, sub, or oid property)');
      }

      // Find user's team ID from league ranking
      const rankingResponse = await fantasyAPI.getLeagueRanking(leagueId);
      let teams = [];

      if (Array.isArray(rankingResponse)) {
        teams = rankingResponse;
      } else if (rankingResponse?.data && Array.isArray(rankingResponse.data)) {
        teams = rankingResponse.data;
      }

      // If userId is a UUID (JWT sub), try to get the actual user ID from API
      let actualUserId = userId;
      if (userId.length > 10 && userId.includes('-')) {
        try {
          const userResponse = await fantasyAPI.getCurrentUser();
          const apiUser = userResponse.data || userResponse;
          const numericUserId = apiUser.id || apiUser.userId || apiUser.managerId;
          if (numericUserId) {
            actualUserId = numericUserId;
          }
        } catch (error) {
        }
      }

      const userTeam = teams.find(teamRanking => {
        // Try multiple possible manager ID locations (matching Teams.js getUserId logic)
        const managerUserId = teamRanking.userId || 
                             teamRanking.team?.userId || 
                             teamRanking.team?.manager?.id ||
                             teamRanking.team?.manager?.userId;
        
        return managerUserId && actualUserId && managerUserId.toString() === actualUserId.toString();
      });

      if (!userTeam) {
        throw new Error(`User team not found in league. Looking for user ID: ${actualUserId}`);
      }

      this.userTeamId = userTeam.team?.id;

      if (!this.userTeamId) {
        throw new Error('Could not extract team ID from user team data');
      }

      // Load team data and money
      await this.refreshData(leagueId);

      return { success: true, teamId: this.userTeamId };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Load existing bids from market data
   */
   async loadExistingBids(leagueId, marketData, preserveRecentBids = true) {
    if (!leagueId || !this.userTeamId || !marketData) return;

    // Preserve recent bids (made in the last 5 minutes) to avoid clearing just-made bids
    // But exclude recently canceled bids
    const recentBids = new Map();
    if (preserveRecentBids) {
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);

      // Clean up old canceled entries first
      for (const [playerId, cancelTime] of this.recentlyCanceled) {
        if (cancelTime < fiveMinutesAgo) {
          this.recentlyCanceled.delete(playerId);
        }
      }

      for (const [playerId, offer] of this.userOffers) {
        // Don't preserve bids that were recently canceled
        const wasCanceled = this.recentlyCanceled.has(playerId);
        if (offer.timestamp && offer.timestamp > fiveMinutesAgo && !wasCanceled) {
          recentBids.set(playerId, offer);
        }
      }
    }

    // Clear existing offers to avoid duplicates
    this.userOffers.clear();

    // Restore recent bids immediately
    for (const [playerId, offer] of recentBids) {
      this.userOffers.set(playerId, offer);
    }

    try {
      // Check each market item for existing bids
      marketData.forEach((item) => {
        try {
          // Check for direct bid data in the market response (new format)
          if (item.bid && item.bid.id && item.bid.money && item.bid.status === 'pending') {
            // This is a bid made by the current user (since it appears in their market data)
            // Only add if we don't already have this bid (avoid duplicating recent bids)
            if (!this.userOffers.has(item.playerMaster.id)) {
              this.addOffer(
                item.playerMaster.id,
                item.bid.money,
                item.playerMaster.nickname || item.playerMaster.name,
                item.bid.id
              );
            }
            return;
          }

          // Legacy: For clause players (marketPlayerTeam), only check if we might own this player
          // Don't make API calls for players we don't own - this causes 403 errors
          if (item.discr === 'marketPlayerTeam' &&
              item.playerTeam?.playerTeamId &&
              !item.bid &&
              item.playerTeam?.teamId === this.userTeamId) {
            // Only check for offers on players we own
            this.loadBidFromAPI(leagueId, item);
          }
        } catch (error) {
        }
      });
    } catch (error) {
    }
  }

  /**
   * Load bid from API (fallback for legacy support)
   */
  async loadBidFromAPI(leagueId, item) {
    try {
      const offerData = await fantasyAPI.getPlayerOffer(leagueId, item.playerTeam.playerTeamId);
      const offers = offerData.data || offerData || [];

      // Check if any offer is from the current user's team
      const userBid = offers.find(offer => {
        return offer.bidderTeam?.id === this.userTeamId;
      });

      if (userBid && !this.userOffers.has(item.playerMaster.id)) {
        this.addOffer(
          item.playerMaster.id,
          userBid.money,
          item.playerMaster.nickname || item.playerMaster.name,
          userBid.id
        );
      }
    } catch (error) {
      // Silently ignore errors for individual players
      // This can happen if a player has no offers
    }
  }

  /**
   * Refresh team data and money
   */
  async refreshData(leagueId) {
    if (!this.userTeamId) return;

    try {
      const [moneyResponse, teamResponse] = await Promise.allSettled([
        fantasyAPI.getTeamMoney(this.userTeamId),
        fantasyAPI.getTeamData(leagueId, this.userTeamId)
      ]);

      if (moneyResponse.status === 'fulfilled') {
        this.teamMoney = moneyResponse.value.data || moneyResponse.value;
      }

      if (teamResponse.status === 'fulfilled') {
        this.teamData = teamResponse.value.data || teamResponse.value;
      }

      this.lastUpdate = Date.now();
    } catch (error) {
    }
  }

  /**
   * Get total team money (before bids)
   */
  getTotalMoney() {
    if (!this.teamMoney) return 0;
    const rawMoney = typeof this.teamMoney === 'number'
      ? this.teamMoney
      : this.teamMoney.teamMoney || this.teamMoney.amount || 0;
    
    // Safety check: if money seems unreasonably high (> 1 billion), something is wrong
    const MAX_REASONABLE_MONEY = 1000000000; // 1 billion euros
    if (rawMoney > MAX_REASONABLE_MONEY) {
      return MAX_REASONABLE_MONEY;
    }
    
    return rawMoney;
  }

  /**
   * Get team value from team data
   */
  getTeamValue() {
    if (!this.teamData) return 0;
    const rawTeamValue = this.teamData.teamValue || this.teamData.team?.teamValue || 0;
    
    // Safety check: if team value seems unreasonably high (> 10 billion), cap it
    // This prevents calculation errors from extreme values
    const MAX_REASONABLE_TEAM_VALUE = 10000000000; // 10 billion euros
    if (rawTeamValue > MAX_REASONABLE_TEAM_VALUE) {
      return MAX_REASONABLE_TEAM_VALUE;
    }
    
    return rawTeamValue;
  }

  /**
   * Get total bid amount for all current offers
   */
  getTotalBidAmount() {
    return Array.from(this.userOffers.values()).reduce((sum, offer) => sum + (offer.amount || 0), 0);
  }

  /**
   * Get available team money (basic calculation without team value bonus)
   */
  getAvailableMoney() {
    if (!this.teamMoney) return 0;
    return Math.max(0, this.getTotalMoney() - this.getTotalBidAmount());
  }

  /**
   * Get team value bonus (20% rounded down)
   */
  getTeamValueBonus() {
    const teamValue = this.getTeamValue();
    return Math.floor(teamValue * 0.2); // 20% of team value, rounded DOWN
  }

  /**
   * Get available money for bids (includes 20% of team value)
   */
  getAvailableMoneyForBids() {
    if (!this.teamMoney) return 0;
    
    const totalMoney = this.getTotalMoney();
    const teamValueBonus = this.getTeamValueBonus();
    const bidTotal = this.getTotalBidAmount();
    
    return Math.max(0, totalMoney + teamValueBonus - bidTotal);
  }


  /**
   * Check if user has an offer on a player
   */
  hasOffer(playerId) {
    return this.userOffers.has(playerId);
  }

  /**
   * Get user's offer amount for a player
   */
  getOfferAmount(playerId) {
    const offer = this.userOffers.get(playerId);
    return offer ? offer.amount : 0;
  }

  /**
   * Add/update a user offer
   */
  addOffer(playerId, amount, playerName, bidId = null) {
    this.userOffers.set(playerId, {
      amount,
      playerName,
      bidId,
      timestamp: Date.now()
    });
  }

  /**
   * Remove a user offer
   */
  removeOffer(playerId) {
    const deleted = this.userOffers.delete(playerId);
    // Also mark this player as recently canceled to prevent re-adding during loadExistingBids
    this.recentlyCanceled.set(playerId, Date.now());
    return deleted;
  }

  /**
   * Get all user offers
   */
  getAllOffers() {
    return Array.from(this.userOffers.entries()).map(([playerId, offer]) => ({
      playerId,
      ...offer
    }));
  }

  /**
   * Check and load offer data for a specific player
   */
  async checkPlayerOffer(leagueId, playerTeamId) {
    try {
      const response = await fantasyAPI.getPlayerOffer(leagueId, playerTeamId);
      return response.data || response;
    } catch (error) {
      // Player likely has no offers
      return null;
    }
  }

  /**
   * Make a bid on a player
   */
  async makeBid(leagueId, marketId, bidAmount, playerId, playerName) {
    try {
      const availableMoneyForBids = this.getAvailableMoneyForBids();

      if (bidAmount > availableMoneyForBids) {
        throw new Error(`No tienes suficiente dinero. Disponible para pujas: ${availableMoneyForBids.toLocaleString()}€`);
      }

      // Make the API call
      const response = await fantasyAPI.makeBid(leagueId, marketId, bidAmount);
      const responseData = response.data || response;

      // Track the bid locally with bid ID from response
      const bidId = responseData.id;
      this.addOffer(playerId, bidAmount, playerName, bidId);

      return { success: true, data: responseData, bidId };
    } catch (error) {
      // Extract the specific error message from the API response
      const apiError = error.response?.data?.message || error.message;
      throw new Error(apiError);
    }
  }

  /**
   * Cancel a bid on a player
   */
  async cancelBid(leagueId, marketId, playerId) {
    try {
      const offer = this.userOffers.get(playerId);
      if (!offer || !offer.bidId) {
        throw new Error('No se encontró la oferta para cancelar');
      }

      // Make the API call to cancel the bid
      const response = await fantasyAPI.cancelBid(leagueId, marketId, offer.bidId);

      // Remove the offer locally immediately
      this.removeOffer(playerId);

      return { success: true, data: response.data || response };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Modify an existing bid on a player
   */
  async modifyBid(leagueId, marketId, playerId, newBidAmount, playerName) {
    try {
      const offer = this.userOffers.get(playerId);
      if (!offer || !offer.bidId) {
        throw new Error('No se encontró la oferta para modificar');
      }

      const availableMoneyForBids = this.getAvailableMoneyForBids();
      const currentBidAmount = offer.amount;

      // For modifications, we need to add back the current bid to get total available for this bid
      const totalAvailableForThisBid = availableMoneyForBids + currentBidAmount;

      if (newBidAmount > totalAvailableForThisBid) {
        throw new Error(`No tienes suficiente dinero. Máximo disponible para pujas: ${totalAvailableForThisBid.toLocaleString()}€`);
      }

      // Make the API call to modify the bid
      const response = await fantasyAPI.modifyBid(leagueId, marketId, offer.bidId, newBidAmount);
      const responseData = response.data || response;

      // Update the offer locally with new amount
      this.addOffer(playerId, newBidAmount, playerName || offer.playerName, offer.bidId);

      return { success: true, data: responseData };
    } catch (error) {
      // Extract the specific error message from the API response
      const apiError = error.response?.data?.message || error.message;
      throw new Error(apiError);
    }
  }

  /**
   * Get team ID
   */
  getTeamId() {
    return this.userTeamId;
  }

  /**
   * Get team data
   */
  getTeamData() {
    return this.teamData;
  }
}

// Export singleton instance
const teamService = new TeamService();
export default teamService;

import { fantasyAPI } from './api';
import { DiscordNotificationService } from './discordNotificationService';
import toast from 'react-hot-toast';

class AlertMonitoringService {
  constructor() {
    this.isMonitoring = false;
    this.checkInterval = null;
    this.checkFrequency = 30000; // 30 seconds
    this.discordService = new DiscordNotificationService();
    this.lastClausesCheck = null;
    this.lastMarketCheck = null;
    this.retryCount = 0;
    this.maxRetries = 3;
  }

  /**
   * Start monitoring alerts
   * @param {Array} alerts - Array of active alerts to monitor
   * @param {Function} onAlertTriggered - Callback when alert is triggered
   */
  startMonitoring(alerts = [], onAlertTriggered = null) {
    if (this.isMonitoring) {
            return;
    }

    this.isMonitoring = true;
    this.onAlertTriggered = onAlertTriggered;


    // Initial check
    this.checkAlerts(alerts);

    // Set up periodic checking
    this.checkInterval = setInterval(() => {
      this.checkAlerts(alerts);
    }, this.checkFrequency);
  }

  /**
   * Stop monitoring alerts
   */
  stopMonitoring() {
    if (!this.isMonitoring) return;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.isMonitoring = false;
      }

  /**
   * Update alerts being monitored
   * @param {Array} alerts - Updated array of alerts
   */
  updateAlerts(alerts) {
    this.alerts = alerts;
  }

  /**
   * Check all active alerts
   * @param {Array} alerts - Array of alerts to check
   */
  async checkAlerts(alerts) {
    if (!alerts || alerts.length === 0) {
      return;
    }

    const activeAlerts = alerts.filter(alert =>
      alert.enabled && alert.status === 'active'
    );

    if (activeAlerts.length === 0) {
      return;
    }


    try {
      // Group alerts by type for efficient API calls
      const clauseAlerts = activeAlerts.filter(a => a.type === 'clause_available' || a.type === 'clause_unlock');
      const marketAlerts = activeAlerts.filter(a => a.type === 'market_listing');
      const priceAlerts = activeAlerts.filter(a => a.type === 'price_change');

      // Check clause alerts
      if (clauseAlerts.length > 0) {
        await this.checkClauseAlerts(clauseAlerts);
      }

      // Check market alerts
      if (marketAlerts.length > 0) {
        await this.checkMarketAlerts(marketAlerts);
      }

      // Check price alerts
      if (priceAlerts.length > 0) {
        await this.checkPriceAlerts(priceAlerts);
      }

      this.retryCount = 0; // Reset retry count on success
    } catch (error) {
      this.handleCheckError(error);
    }
  }

  /**
   * Check clause availability alerts
   * @param {Array} clauseAlerts - Array of clause alerts
   */
  async checkClauseAlerts(clauseAlerts) {
    // Group by leagueId so we walk each league's rosters at most once per cycle.
    const byLeague = new Map();
    for (const a of clauseAlerts) {
      if (!a.leagueId) continue;
      if (!byLeague.has(a.leagueId)) byLeague.set(a.leagueId, []);
      byLeague.get(a.leagueId).push(a);
    }

    this.lastClausesCheck = new Date().toISOString();

    for (const [leagueId, alerts] of byLeague.entries()) {
      try {
        const clausesResponse = await fantasyAPI.getClauses(leagueId);
        const clauses = clausesResponse?.data || [];

        for (const alert of alerts) {
          const playerClause = clauses.find(clause =>
            (clause.playerId && String(clause.playerId) === String(alert.playerId)) ||
            (clause.player?.id && String(clause.player.id) === String(alert.playerId))
          );
          if (playerClause && this.isClauseAvailable(playerClause)) {
            await this.triggerAlert(alert, {
              clauseValue: playerClause.clauseValue || playerClause.value,
              isActive: true,
              checkedAt: new Date().toISOString(),
            });
          }
        }
      } catch (error) {
        // Surface the error so checkAlerts() can count retries, but keep going
        // for other leagues.
      }
    }
  }

  /**
   * Check if a clause is available based on different API response formats
   * @param {Object} clause - Clause object from API
   * @returns {boolean} Whether clause is available
   */
  isClauseAvailable(clause) {
    // Handle different possible clause formats
    if (clause.isActive === true) return true;
    if (clause.active === true) return true;
    if (clause.available === true) return true;
    if (clause.status === 'active' || clause.status === 'available') return true;

    // If no explicit status, check if clause has a value and no end date or future end date
    if (clause.clauseValue > 0 || clause.value > 0) {
      if (!clause.endDate) return true;
      if (clause.endDate && new Date(clause.endDate) > new Date()) return true;
    }

    return false;
  }

  /**
   * Check market listing alerts
   * @param {Array} marketAlerts - Array of market alerts
   */
  async checkMarketAlerts(marketAlerts) {
    // Group by leagueId — market is league-scoped.
    const byLeague = new Map();
    for (const a of marketAlerts) {
      if (!a.leagueId) continue;
      if (!byLeague.has(a.leagueId)) byLeague.set(a.leagueId, []);
      byLeague.get(a.leagueId).push(a);
    }

    this.lastMarketCheck = new Date().toISOString();

    const matches = (entry, playerId) => {
      const pid = String(playerId);
      return (entry?.id && String(entry.id) === pid)
        || (entry?.playerId && String(entry.playerId) === pid)
        || (entry?.player?.id && String(entry.player.id) === pid)
        || (entry?.playerMaster?.id && String(entry.playerMaster.id) === pid);
    };

    for (const [leagueId, alerts] of byLeague.entries()) {
      try {
        const marketResponse = await fantasyAPI.getMarket(leagueId);
        const marketEntries = marketResponse?.data || [];

        for (const alert of alerts) {
          const entry = marketEntries.find(e => matches(e, alert.playerId));
          if (entry) {
            const pm = entry.playerMaster || entry.player || entry;
            await this.triggerAlert(alert, {
              inMarket: true,
              marketPrice: entry.salePrice || pm?.marketValue || pm?.price,
              marketDate: new Date().toISOString(),
              checkedAt: new Date().toISOString(),
            });
          }
        }
      } catch (error) {
        // Continue with other leagues.
      }
    }
  }

  /**
   * Check price change alerts
   * @param {Array} priceAlerts - Array of price alerts
   */
  async checkPriceAlerts(priceAlerts) {
    try {

      for (const alert of priceAlerts) {
        try {
          if (!alert.leagueId) continue;
          const playerResponse = await fantasyAPI.getPlayerDetails(alert.playerId, alert.leagueId);
          const player = playerResponse?.data || playerResponse;

          if (!player || !alert.targetValue) continue;

          const currentPrice = player.marketValue || player.price || 0;
          const targetPrice = parseFloat(alert.targetValue);

          // Check if price has reached target (with 1% tolerance)
          const priceDifference = Math.abs(currentPrice - targetPrice);
          const tolerance = targetPrice * 0.01;

          if (priceDifference <= tolerance) {
            await this.triggerAlert(alert, {
              currentPrice,
              targetPrice,
              priceDifference,
              checkedAt: new Date().toISOString()
            });
          }
        } catch (error) {
        }
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Trigger an alert and send notifications
   * @param {Object} alert - Alert object
   * @param {Object} triggerData - Data about what triggered the alert
   */
  async triggerAlert(alert, triggerData = {}) {
    try {

      // Send Discord notification if configured
      if (alert.notificationMethods?.includes('discord') && alert.discordWebhook) {
        try {
          await this.discordService.sendAlert(alert.discordWebhook, {
            ...alert,
            triggerData
          });
                  } catch (discordError) {
          toast.error(`❌ Error sending Discord notification for ${alert.playerName}`);
        }
      }

      // Send in-app notification
      const alertTypeText = {
        'clause_available': '🛡️ Cláusula disponible',
        'clause_unlock': '🔓 Cláusula desbloqueada',
        'market_listing': '🏪 En el mercado',
        'price_change': '💰 Cambio de precio'
      };

      toast.success(
        `${alertTypeText[alert.type] || '🔔 Alerta'}: ${alert.playerName}`,
        {
          duration: 8000,
          style: {
            background: '#10B981',
            color: 'white',
          },
          iconTheme: {
            primary: 'white',
            secondary: '#10B981',
          },
        }
      );

      // Call callback if provided
      if (this.onAlertTriggered) {
        this.onAlertTriggered(alert, triggerData);
      }

    } catch (error) {
    }
  }

  /**
   * Handle errors during alert checking
   * @param {Error} error - The error that occurred
   */
  handleCheckError(_error) {
    this.retryCount++;

    if (this.retryCount >= this.maxRetries) {
      toast.error('❌ Error checking alerts. Please check your connection.');
      this.retryCount = 0;
    }
  }

  /**
   * Get monitoring status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      checkFrequency: this.checkFrequency,
      lastClausesCheck: this.lastClausesCheck,
      lastMarketCheck: this.lastMarketCheck,
      retryCount: this.retryCount
    };
  }

  /**
   * Set check frequency
   * @param {number} frequency - Check frequency in milliseconds
   */
  setCheckFrequency(frequency) {
    if (frequency < 10000) { // Minimum 10 seconds
      return;
    }

    this.checkFrequency = frequency;

    if (this.isMonitoring) {
      // Restart monitoring with new frequency
      this.stopMonitoring();
      // Note: You'll need to restart with the current alerts
          }
  }

  /**
   * Test alert functionality
   * @param {Object} alert - Alert to test
   */
  async testAlert(alert) {

    const testTriggerData = {
      isTest: true,
      testedAt: new Date().toISOString()
    };

    await this.triggerAlert(alert, testTriggerData);
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.stopMonitoring();
    this.discordService = null;
    this.onAlertTriggered = null;
  }
}

// Export singleton instance
export const alertMonitoringService = new AlertMonitoringService();
export default alertMonitoringService;

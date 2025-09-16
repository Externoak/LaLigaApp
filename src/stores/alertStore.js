import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { fantasyAPI } from '../services/api';
import toast from 'react-hot-toast';

export const useAlertStore = create(
  persist(
    (set, get) => ({
      // Alert state
      alerts: [],
      isMonitoring: false,
      lastCheckTime: null,
      alertCounts: {
        total: 0,
        active: 0,
        triggered: 0
      },

      // Initialize alerts from localStorage
      initializeAlerts: (userId, leagueId) => {
        if (!userId || !leagueId) return;
        
        const storageKey = `alerts_${userId}_${leagueId}`;
        const savedAlerts = localStorage.getItem(storageKey);
        
        if (savedAlerts) {
          try {
            const alerts = JSON.parse(savedAlerts);
            set({ alerts });
            get().updateAlertCounts();
          } catch (error) {
          }
        }
      },

      // Save alerts to localStorage
      saveAlertsToStorage: (alerts, userId, leagueId) => {
        if (!userId || !leagueId) return;
        
        const storageKey = `alerts_${userId}_${leagueId}`;
        localStorage.setItem(storageKey, JSON.stringify(alerts));
        set({ alerts });
        get().updateAlertCounts();
      },

      // Update alert counts
      updateAlertCounts: () => {
        const alerts = get().alerts;
        const counts = {
          total: alerts.length,
          active: alerts.filter(a => a.enabled && a.status === 'active').length,
          triggered: alerts.filter(a => a.status === 'triggered').length
        };
        set({ alertCounts: counts });
      },

      // Create a new alert
      createAlert: (alertData, userId, leagueId) => {
        const newAlert = {
          id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          ...alertData,
          userId,
          leagueId,
          status: 'active',
          createdAt: new Date().toISOString(),
          triggeredAt: null,
          lastChecked: null
        };

        const currentAlerts = get().alerts;
        const updatedAlerts = [...currentAlerts, newAlert];
        
        get().saveAlertsToStorage(updatedAlerts, userId, leagueId);
        
        toast.success(`✅ Alerta creada para ${alertData.playerName}`);
        return newAlert;
      },

      // Update an existing alert
      updateAlert: (alertId, updates, userId, leagueId) => {
        const currentAlerts = get().alerts;
        const updatedAlerts = currentAlerts.map(alert =>
          alert.id === alertId ? { ...alert, ...updates } : alert
        );
        
        get().saveAlertsToStorage(updatedAlerts, userId, leagueId);
        return updatedAlerts.find(a => a.id === alertId);
      },

      // Delete an alert
      deleteAlert: (alertId, userId, leagueId) => {
        const currentAlerts = get().alerts;
        const updatedAlerts = currentAlerts.filter(alert => alert.id !== alertId);
        
        get().saveAlertsToStorage(updatedAlerts, userId, leagueId);
        toast.success('🗑️ Alerta eliminada');
      },

      // Toggle alert enabled/disabled
      toggleAlert: (alertId, userId, leagueId) => {
        const currentAlerts = get().alerts;
        const alert = currentAlerts.find(a => a.id === alertId);
        
        if (alert) {
          const updatedAlert = { ...alert, enabled: !alert.enabled };
          get().updateAlert(alertId, { enabled: !alert.enabled }, userId, leagueId);
          
          toast.success(
            updatedAlert.enabled 
              ? `🔔 Alerta activada para ${alert.playerName}` 
              : `🔕 Alerta pausada para ${alert.playerName}`
          );
        }
      },

      // Get alerts for a specific player
      getPlayerAlerts: (playerId) => {
        return get().alerts.filter(alert => 
          alert.playerId === playerId && 
          alert.enabled && 
          alert.status === 'active'
        );
      },

      // Check if a player has active alerts
      hasActiveAlerts: (playerId) => {
        return get().getPlayerAlerts(playerId).length > 0;
      },

      // Get alert counts for UI badges
      getAlertCounts: () => {
        return get().alertCounts;
      },

      // Mark alert as triggered
      triggerAlert: async (alertId, triggerData, userId, leagueId) => {
        const alert = get().alerts.find(a => a.id === alertId);
        if (!alert) return;

        // Update alert status
        const updatedAlert = {
          ...alert,
          status: 'triggered',
          triggeredAt: new Date().toISOString(),
          triggerData
        };

        get().updateAlert(alertId, {
          status: 'triggered',
          triggeredAt: new Date().toISOString(),
          triggerData
        }, userId, leagueId);

        // Send notification
        await get().sendNotification(updatedAlert);
        
        return updatedAlert;
      },

      // Send notification through configured methods
      sendNotification: async (alert) => {
        const notificationPromises = [];

        // Discord notification
        if (alert.notificationMethods?.includes('discord') && alert.discordWebhook) {
          const { DiscordNotificationService } = await import('../services/discordNotificationService');
          const discordService = new DiscordNotificationService();
          notificationPromises.push(
            discordService.sendAlert(alert.discordWebhook, alert)
          );
        }

        // Toast notification (in-app)
        const alertTypeText = {
          'clause_available': 'Cláusula disponible',
          'market_listing': 'En el mercado',
          'price_change': 'Cambio de precio'
        };

        toast.success(
          `🔔 ${alert.playerName}: ${alertTypeText[alert.type] || 'Alerta'}!`,
          { duration: 5000 }
        );

        try {
          await Promise.all(notificationPromises);
        } catch (error) {
          toast.error('❌ Error enviando notificación');
        }
      },

      // Start monitoring alerts
      startMonitoring: () => {
        if (get().isMonitoring) return;
        
        set({ isMonitoring: true });
        
        // Check alerts every 30 seconds
        const checkInterval = setInterval(() => {
          get().checkAlerts();
        }, 30000);

        // Store interval ID for cleanup
        set({ monitoringInterval: checkInterval });
      },

      // Stop monitoring alerts
      stopMonitoring: () => {
        const interval = get().monitoringInterval;
        if (interval) {
          clearInterval(interval);
          set({ monitoringInterval: null });
        }
        set({ isMonitoring: false });
      },

      // Check all active alerts
      checkAlerts: async () => {
        const activeAlerts = get().alerts.filter(a => 
          a.enabled && a.status === 'active'
        );

        if (activeAlerts.length === 0) {
          set({ lastCheckTime: new Date().toISOString() });
          return;
        }

        for (const alert of activeAlerts) {
          try {
            await get().checkSingleAlert(alert);
          } catch (error) {
          }
        }

        set({ lastCheckTime: new Date().toISOString() });
      },

      // Check a single alert
      checkSingleAlert: async (alert) => {
        try {
          let isTriggered = false;

          switch (alert.type) {
            case 'clause_available':
              isTriggered = await get().checkClauseAlert(alert);
              break;
            case 'market_listing':
              isTriggered = await get().checkMarketAlert(alert);
              break;
            case 'price_change':
              isTriggered = await get().checkPriceAlert(alert);
              break;
            default:
          }

          if (isTriggered) {
            await get().triggerAlert(alert.id, {
              checkedAt: new Date().toISOString(),
              type: alert.type
            }, alert.userId, alert.leagueId);
          }

        } catch (error) {
        }
      },

      // Check clause availability
      checkClauseAlert: async (alert) => {
        try {
          const clausesResponse = await fantasyAPI.getClauses();
          const clauses = clausesResponse?.data || clausesResponse || [];
          
          // Check if player's clause is now available
          const playerClause = clauses.find(clause => 
            clause.playerId === alert.playerId || 
            clause.player?.id === alert.playerId
          );

          if (playerClause && playerClause.isActive !== false) {
            return true;
          }

          return false;
        } catch (error) {
          return false;
        }
      },

      // Check market listing
      checkMarketAlert: async (alert) => {
        try {
          const marketResponse = await fantasyAPI.getMarket();
          const marketPlayers = marketResponse?.data || marketResponse || [];
          
          // Check if player is in today's market
          const isInMarket = marketPlayers.some(player => 
            player.id === alert.playerId || 
            player.playerId === alert.playerId
          );

          return isInMarket;
        } catch (error) {
          return false;
        }
      },

      // Check price change
      checkPriceAlert: async (alert) => {
        try {
          const playerResponse = await fantasyAPI.getPlayer(alert.playerId);
          const player = playerResponse?.data || playerResponse;
          
          if (!player || !alert.targetValue) return false;

          const currentPrice = player.marketValue || player.price || 0;
          const targetPrice = parseFloat(alert.targetValue);

          // Check if price has reached target (either increase or decrease)
          if (Math.abs(currentPrice - targetPrice) <= (targetPrice * 0.01)) { // 1% tolerance
            return true;
          }

          return false;
        } catch (error) {
          return false;
        }
      },

      // Clean up expired or triggered alerts
      cleanupAlerts: (userId, leagueId) => {
        const currentAlerts = get().alerts;
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        
        const activeAlerts = currentAlerts.filter(alert => {
          // Keep active alerts
          if (alert.status === 'active' && alert.enabled) return true;
          
          // Remove old triggered alerts (older than 1 week)
          if (alert.status === 'triggered') {
            const triggeredDate = new Date(alert.triggeredAt);
            return triggeredDate > oneWeekAgo;
          }
          
          return true;
        });

        if (activeAlerts.length !== currentAlerts.length) {
          get().saveAlertsToStorage(activeAlerts, userId, leagueId);
          toast.success(`🧹 Limpieza completada: ${currentAlerts.length - activeAlerts.length} alertas eliminadas`);
        }
      },

      // Reset store state
      resetAlerts: () => {
        get().stopMonitoring();
        set({
          alerts: [],
          isMonitoring: false,
          lastCheckTime: null,
          alertCounts: { total: 0, active: 0, triggered: 0 }
        });
      }
    }),
    {
      name: 'alert-storage',
      partialize: (state) => ({
        // Don't persist monitoring state or intervals
        alerts: state.alerts,
        lastCheckTime: state.lastCheckTime
      })
    }
  )
);
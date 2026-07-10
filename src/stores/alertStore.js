import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { fantasyAPI } from '../services/api';
import { fetchLeagueClauses } from '../utils/fetchAllTeamsData';
import { queryClient } from '../utils/queryClient';
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

      // Send notification (in-app toast)
      sendNotification: async (alert) => {
        const alertTypeText = {
          'clause_available': '🛡️ Cláusula disponible',
          'clause_unlock': '🔓 Cláusula desbloqueada',
          'market_listing': '🏪 En el mercado',
          'price_change': '💰 Cambio de precio'
        };

        toast.success(
          `${alertTypeText[alert.type] || '🔔 Alerta'}: ${alert.playerName}`,
          { duration: 8000 }
        );
      },

      // Dispara la notificación de una alerta sin cambiar su estado (botón de prueba)
      testAlert: async (alert) => {
        await get().sendNotification({
          ...alert,
          triggerData: { isTest: true, testedAt: new Date().toISOString() }
        });
      },

      // Start monitoring alerts
      startMonitoring: () => {
        if (get().isMonitoring) return;

        set({ isMonitoring: true });

        // Primera pasada inmediata; después cada 2 minutos — los bloqueos de
        // cláusula y el mercado cambian despacio, y un ciclo puede recorrer
        // todos los equipos de la liga, así que un intervalo corto arriesga
        // rate-limits (429).
        get().checkAlerts();
        const checkInterval = setInterval(() => {
          get().checkAlerts();
        }, 120000);

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

        // Per-cycle fetch cache: N alerts on the same league share one
        // getClauses/getMarket call instead of N (getClauses alone walks
        // every team in the league).
        const fetchCache = new Map();

        for (const alert of activeAlerts) {
          try {
            await get().checkSingleAlert(alert, fetchCache);
          } catch (error) {
          }
        }

        set({ lastCheckTime: new Date().toISOString() });
      },

      // Check a single alert. Cada check devuelve un objeto con los datos del
      // disparo (o null), que se guarda en la alerta vía triggerData.
      checkSingleAlert: async (alert, fetchCache = new Map()) => {
        try {
          let triggerData = null;

          switch (alert.type) {
            case 'clause_available':
            case 'clause_unlock': // tipo legado: mismas condiciones
              triggerData = await get().checkClauseAlert(alert, fetchCache);
              break;
            case 'market_listing':
              triggerData = await get().checkMarketAlert(alert, fetchCache);
              break;
            case 'price_change':
              triggerData = await get().checkPriceAlert(alert);
              break;
            default:
          }

          if (triggerData) {
            await get().triggerAlert(alert.id, {
              ...triggerData,
              checkedAt: new Date().toISOString(),
              type: alert.type
            }, alert.userId, alert.leagueId);
          }

        } catch (error) {
        }
      },

      // Check clause availability
      checkClauseAlert: async (alert, fetchCache = new Map()) => {
        try {
          if (!alert.leagueId) return null;
          const cacheKey = `clauses:${alert.leagueId}`;
          if (!fetchCache.has(cacheKey)) {
            // Walk de plantillas vía la caché compartida ['teamData'] — los
            // ciclos de 2 min tocan red como mucho cada 15 min.
            fetchCache.set(cacheKey, fetchLeagueClauses(queryClient, alert.leagueId));
          }
          const clausesResponse = await fetchCache.get(cacheKey);
          const clauses = clausesResponse?.data || [];

          const playerClause = clauses.find(clause =>
            String(clause.playerId) === String(alert.playerId) ||
            String(clause.player?.id) === String(alert.playerId)
          );

          if (!playerClause || playerClause.isActive === false) return null;
          return {
            clauseValue: playerClause.clauseValue || playerClause.value,
            isActive: true
          };
        } catch (error) {
          return null;
        }
      },

      // Check market listing
      checkMarketAlert: async (alert, fetchCache = new Map()) => {
        try {
          if (!alert.leagueId) return null;
          const cacheKey = `market:${alert.leagueId}`;
          if (!fetchCache.has(cacheKey)) {
            fetchCache.set(cacheKey, fantasyAPI.getMarket(alert.leagueId));
          }
          const marketResponse = await fetchCache.get(cacheKey);
          const marketEntries = marketResponse?.data || [];

          const pid = String(alert.playerId);
          const entry = marketEntries.find(e =>
            String(e?.id) === pid ||
            String(e?.playerId) === pid ||
            String(e?.player?.id) === pid ||
            String(e?.playerMaster?.id) === pid
          );

          if (!entry) return null;
          const pm = entry.playerMaster || entry.player || entry;
          return {
            inMarket: true,
            marketPrice: entry.salePrice || pm?.marketValue || pm?.price
          };
        } catch (error) {
          return null;
        }
      },

      // Check price change
      checkPriceAlert: async (alert) => {
        try {
          if (!alert.leagueId) return null;
          const playerResponse = await fantasyAPI.getPlayerDetails(alert.playerId, alert.leagueId);
          const player = playerResponse?.data || playerResponse;

          if (!player || !alert.targetValue) return null;

          const currentPrice = player.marketValue || player.price || 0;
          const targetPrice = parseFloat(alert.targetValue);

          // Check if price has reached target (either increase or decrease)
          if (Math.abs(currentPrice - targetPrice) <= (targetPrice * 0.01)) { // 1% tolerance
            return { currentPrice, targetPrice };
          }

          return null;
        } catch (error) {
          return null;
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
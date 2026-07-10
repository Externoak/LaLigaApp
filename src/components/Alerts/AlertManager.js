import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from '../../utils/motionShim';
import {
  Bell, Plus, X, Clock, Shield, TrendingUp, User,
  AlertTriangle, Check, Settings, Trash2, Play, Pause, TestTube
} from 'lucide-react';
import { fantasyAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useAlertStore } from '../../stores/alertStore';
import LoadingSpinner from '../Common/LoadingSpinner';
import toast from 'react-hot-toast';

const AlertManager = () => {
  const [_loading] = useState(false);
  const [_error] = useState(null);
  const [showCreateAlert, setShowCreateAlert] = useState(false);
  const [availablePlayers, setAvailablePlayers] = useState([]);

  const leagueId = useAuthStore((state) => state.leagueId);
  const user = useAuthStore((state) => state.user);
  const alerts = useAlertStore((state) => state.alerts);
  const initializeAlerts = useAlertStore((state) => state.initializeAlerts);
  const createAlert = useAlertStore((state) => state.createAlert);
  const deleteAlert = useAlertStore((state) => state.deleteAlert);
  const toggleAlert = useAlertStore((state) => state.toggleAlert);
  const isMonitoring = useAlertStore((state) => state.isMonitoring);
  const startMonitoring = useAlertStore((state) => state.startMonitoring);
  const stopMonitoring = useAlertStore((state) => state.stopMonitoring);
  const storeTestAlert = useAlertStore((state) => state.testAlert);

  const handleStartMonitoring = useCallback(() => {
    const activeAlerts = alerts.filter(a => a.enabled && a.status === 'active');
    if (activeAlerts.length === 0) {
      toast.error('No hay alertas activas para monitorear');
      return;
    }

    // El motor del store lee las alertas vigentes en cada ciclo y actualiza
    // el estado/notificaciones él mismo.
    startMonitoring();

    toast.success(`🔍 Monitoreo iniciado para ${activeAlerts.length} alertas`);
  }, [alerts, startMonitoring]);

  // New Alert Form State
  const [newAlert, setNewAlert] = useState({
    type: 'clause_available', // clause_available, market_listing, price_change, clause_unlock (legacy)
    playerId: '',
    playerName: '',
    playerTeam: '',
    playerImage: '',
    targetDate: '',
    targetValue: '',
    message: '',
    enabled: true
  });

  useEffect(() => {
    if (leagueId && user?.userId) {
      initializeAlerts(user.userId, leagueId);
      fetchAvailablePlayers();

      // Start monitoring if there are active alerts
      const activeAlerts = alerts.filter(a => a.enabled && a.status === 'active');
      if (activeAlerts.length > 0 && !isMonitoring) {
        handleStartMonitoring();
      }
    }
  }, [leagueId, user?.userId, alerts, handleStartMonitoring, initializeAlerts, isMonitoring]);

  // Removed fetchAlerts - now handled by store (checkAlerts lee las alertas
  // vigentes del store en cada ciclo, no hace falta sincronizar nada aquí)

  const fetchAvailablePlayers = async () => {
    try {
      const response = await fantasyAPI.getAllPlayers();
      setAvailablePlayers(response.data || []);
    } catch (err) {
      // Error handled silently
    }
  };

  const handleCreateAlert = async () => {
    if (!newAlert.playerId) {
      toast.error('Por favor selecciona un jugador');
      return;
    }

    try {
      createAlert(newAlert, user?.userId, leagueId);

      // Reset form
      setNewAlert({
        type: 'clause_available',
        playerId: '',
        playerName: '',
        playerTeam: '',
        playerImage: '',
        targetDate: '',
        targetValue: '',
        message: '',
        enabled: true
      });

      setShowCreateAlert(false);

      // Start monitoring if not already started
      if (!isMonitoring) {
        handleStartMonitoring();
      }

    } catch (error) {
      toast.error('Error al crear la alerta');
    }
  };

  const handleDeleteAlert = (alertId) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar esta alerta?')) {
      deleteAlert(alertId, user?.userId, leagueId);
    }
  };

  const handleToggleAlert = (alertId) => {
    toggleAlert(alertId, user?.userId, leagueId);
  };

  const getAlertIcon = (type) => {
    switch (type) {
      case 'clause_available':
        return <Shield className="w-5 h-5 text-blue-500" />;
      case 'clause_unlock': // Legacy support
        return <Shield className="w-5 h-5 text-blue-500" />;
      case 'market_listing':
        return <User className="w-5 h-5 text-orange-500" />;
      case 'price_change':
        return <TrendingUp className="w-5 h-5 text-green-500" />;
      default:
        return <Bell className="w-5 h-5 text-gray-500" />;
    }
  };

  const getAlertTypeLabel = (type) => {
    switch (type) {
      case 'clause_available':
        return 'Cláusula Disponible';
      case 'clause_unlock': // Legacy support
        return 'Desbloqueo de Cláusula';
      case 'market_listing':
        return 'Jugador en Mercado';
      case 'price_change':
        return 'Cambio de Precio';
      default:
        return 'General';
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // handleStartMonitoring function moved above to avoid no-use-before-define

  const handleStopMonitoring = () => {
    stopMonitoring();
    toast.success('🛑 Monitoreo detenido');
  };

  const testAlert = async (alert) => {
    try {
      await storeTestAlert(alert);
      toast.success(`🧪 Alerta de prueba enviada para ${alert.playerName}`);
    } catch (error) {
      toast.error('❌ Error al probar la alerta');
    }
  };

  if (_loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Mis Alertas
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gestiona tus notificaciones y alertas personalizadas
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowCreateAlert(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nueva Alerta
          </button>

          {isMonitoring ? (
            <button
              onClick={handleStopMonitoring}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
            >
              <Pause className="w-4 h-4" />
              Detener Monitoreo
            </button>
          ) : (
            <button
              onClick={handleStartMonitoring}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
              disabled={alerts.filter(a => a.enabled && a.status === 'active').length === 0}
            >
              <Play className="w-4 h-4" />
              Iniciar Monitoreo
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-dark-card rounded-lg p-6 border border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {alerts.filter(a => a.enabled).length}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Alertas Activas</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-dark-card rounded-lg p-6 border border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Shield className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {alerts.filter(a => a.type === 'clause_available' || a.type === 'clause_unlock').length}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Cláusulas</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-dark-card rounded-lg p-6 border border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
              <TrendingUp className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {alerts.filter(a => a.type === 'price_change').length}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Precios</p>
            </div>
          </div>
        </div>
      </div>

      {/* Alerts List */}
      <div className="space-y-4">
        {alerts.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-dark-card rounded-lg border border-gray-200 dark:border-dark-border">
            <Bell className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              No tienes alertas configuradas
            </p>
            <button
              onClick={() => setShowCreateAlert(true)}
              className="text-primary-500 hover:text-primary-600 transition-colors"
            >
              Crear tu primera alerta
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {alerts.map((alert) => (
              <motion.div
                key={alert.id}
                layout
                className={`bg-white dark:bg-dark-card rounded-lg p-6 border transition-colors ${
                  alert.enabled
                    ? 'border-gray-200 dark:border-dark-border'
                    : 'border-gray-100 dark:border-gray-800 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="mt-1">
                      {getAlertIcon(alert.type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {getAlertTypeLabel(alert.type)}
                        </h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          alert.enabled
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                        }`}>
                          {alert.enabled ? 'Activa' : 'Pausada'}
                        </span>
                      </div>

                      {alert.playerName && (
                        <div className="flex items-center gap-2 mb-2">
                          {alert.playerImage && (
                            <img
                              src={alert.playerImage}
                              alt={alert.playerName}
                              className="w-8 h-8 rounded-full object-cover"
                              onError={(e) => e.target.style.display = 'none'}
                            />
                          )}
                          <div>
                            <p className="text-sm text-gray-600 dark:text-gray-300 mb-0">
                              <strong>{alert.playerName}</strong>
                            </p>
                            {alert.playerTeam && (
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {alert.playerTeam}
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {alert.targetDate && (
                        <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
                          <Clock className="w-4 h-4 inline mr-1" />
                          Fecha objetivo: {formatDate(alert.targetDate)}
                        </p>
                      )}

                      {alert.targetValue && (
                        <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
                          Valor objetivo: {alert.targetValue}€
                        </p>
                      )}

                      {alert.message && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                          {alert.message}
                        </p>
                      )}

                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                        Creada: {formatDate(alert.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => testAlert(alert)}
                      className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                      title="Probar alerta"
                      aria-label="Probar alerta"
                    >
                      <TestTube className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleAlert(alert.id)}
                      className={`p-2 rounded-lg transition-colors ${
                        alert.enabled
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                      title={alert.enabled ? 'Pausar alerta' : 'Activar alerta'}
                      aria-label={alert.enabled ? 'Pausar alerta' : 'Activar alerta'}
                    >
                      {alert.enabled ? <Settings className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteAlert(alert.id)}
                      className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                      title="Eliminar alerta"
                      aria-label="Eliminar alerta"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Create Alert Modal */}
      <AnimatePresence>
        {showCreateAlert && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
            onClick={(e) => e.target === e.currentTarget && setShowCreateAlert(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-dark-card rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Nueva Alerta
                </h2>
                <button
                  onClick={() => setShowCreateAlert(false)}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Alert Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Tipo de Alerta
                  </label>
                  <select
                    value={newAlert.type}
                    onChange={(e) => setNewAlert(prev => ({ ...prev, type: e.target.value }))}
                    className="w-full input-field"
                  >
                    <option value="clause_available">Cláusula Disponible</option>
                    <option value="market_listing">Jugador en Mercado</option>
                    <option value="price_change">Cambio de Precio</option>
                  </select>
                </div>

                {/* Player Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Jugador
                  </label>
                  <select
                    value={newAlert.playerId}
                    onChange={(e) => {
                      const player = availablePlayers.find(p => p.id === e.target.value);
                      setNewAlert(prev => ({
                        ...prev,
                        playerId: e.target.value,
                        playerName: player?.name || player?.nickname || '',
                        playerTeam: player?.team?.name || '',
                        playerImage: player?.images?.transparent?.['256x256'] || ''
                      }));
                    }}
                    className="w-full input-field"
                  >
                    <option value="">Selecciona un jugador</option>
                    {availablePlayers.slice(0, 100).map(player => (
                      <option key={player.id} value={player.id}>
                        {player.name} ({player.team})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Target Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Fecha Objetivo
                  </label>
                  <input
                    type="datetime-local"
                    value={newAlert.targetDate}
                    onChange={(e) => setNewAlert(prev => ({ ...prev, targetDate: e.target.value }))}
                    className="w-full input-field"
                  />
                </div>

                {/* Target Value */}
                {newAlert.type === 'price_change' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Valor Objetivo (€)
                    </label>
                    <input
                      type="number"
                      value={newAlert.targetValue}
                      onChange={(e) => setNewAlert(prev => ({ ...prev, targetValue: e.target.value }))}
                      className="w-full input-field"
                      placeholder="Ej: 10000000"
                    />
                  </div>
                )}

                {/* Message */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Mensaje Personalizado
                  </label>
                  <textarea
                    value={newAlert.message}
                    onChange={(e) => setNewAlert(prev => ({ ...prev, message: e.target.value }))}
                    className="w-full input-field resize-none"
                    rows={3}
                    placeholder="Mensaje opcional para recordarte..."
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleCreateAlert}
                    disabled={!newAlert.playerId}
                    className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Crear Alerta
                  </button>
                  <button
                    onClick={() => setShowCreateAlert(false)}
                    className="flex-1 btn-secondary"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {_error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-400">{_error}</p>
        </div>
      )}
    </div>
  );
};

export default AlertManager;

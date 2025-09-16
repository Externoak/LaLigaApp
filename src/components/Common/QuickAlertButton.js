import React, { useState } from 'react';
import { Bell, Plus } from 'lucide-react';
import { useAlertStore } from '../../stores/alertStore';
import { useAuthStore } from '../../stores/authStore';
import DiscordWebhookSetup from './DiscordWebhookSetup';
import toast from 'react-hot-toast';

const QuickAlertButton = ({ 
  player, 
  alertType = 'clause_available',
  className = '',
  size = 'sm',
  variant = 'default'
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const { createAlert, hasActiveAlerts } = useAlertStore();
  const { user, leagueId } = useAuthStore();
  
  const handleQuickAlert = async (e) => {
    e.stopPropagation(); // Prevent triggering parent onClick events
    
    if (!user?.userId || !leagueId) {
      toast.error('No se pudo obtener la información del usuario o liga');
      return;
    }

    if (!player?.id) {
      toast.error('No se pudo obtener la información del jugador');
      return;
    }

    // Check if player already has alerts of this type
    if (hasActiveAlerts(player.id)) {
      toast.error(`Ya tienes alertas activas para ${player.name || player.nickname}`);
      return;
    }

    setIsCreating(true);
    
    try {
      // Get Discord webhook from localStorage or show setup modal
      const savedWebhook = localStorage.getItem('discord_webhook_default');
      if (!savedWebhook) {
        setIsCreating(false);
        toast.error('Función temporalmente deshabilitada');
        return;
      }

      const alertData = {
        type: alertType,
        playerId: player.id,
        playerName: player.name || player.nickname || 'Jugador',
        playerTeam: player.team?.name || '',
        playerImage: player.images?.transparent?.['256x256'] || '',
        targetDate: '',
        targetValue: player.marketValue || '',
        message: `Alerta rápida creada para ${alertType === 'clause_available' ? 'cláusula' : 'mercado'}`,
        enabled: true,
        notificationMethods: ['discord'],
        discordWebhook: savedWebhook
      };

      createAlert(alertData, user.userId, leagueId);
      
    } catch (error) {
      toast.error('Error al crear la alerta');
    } finally {
      setIsCreating(false);
    }
  };

  // Check if player already has alerts
  const hasAlerts = player?.id && hasActiveAlerts(player.id);

  const sizeClasses = {
    xs: 'w-4 h-4',
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  const buttonClasses = {
    default: `p-1.5 rounded-lg transition-colors ${
      hasAlerts 
        ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' 
        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 hover:text-primary-600 dark:hover:text-primary-400'
    }`,
    subtle: `p-1 rounded transition-colors ${
      hasAlerts 
        ? 'text-yellow-500' 
        : 'text-gray-400 hover:text-primary-500'
    }`,
    prominent: `px-3 py-2 rounded-lg font-medium transition-colors ${
      hasAlerts 
        ? 'bg-yellow-500 text-white cursor-default' 
        : 'bg-primary-500 hover:bg-primary-600 text-white'
    }`
  };

  const alertTypeLabels = {
    clause_available: 'Alerta de Cláusula',
    market_listing: 'Alerta de Mercado',
    price_change: 'Alerta de Precio'
  };

  const handleWebhookSaved = () => {
    // Automatically create the alert after webhook is saved
    handleQuickAlert({ stopPropagation: () => {} });
  };

  if (hasAlerts) {
    return (
      <button
        className={`${buttonClasses[variant]} ${className}`}
        title="Ya tienes alertas para este jugador"
        disabled
      >
        <Bell className={sizeClasses[size]} />
      </button>
    );
  }

  return (
    <>
      <DiscordWebhookSetup
        isOpen={showSetup}
        onClose={() => setShowSetup(false)}
        onWebhookSaved={handleWebhookSaved}
      />
      
      <button
        onClick={handleQuickAlert}
        disabled={isCreating}
        className={`${buttonClasses[variant]} ${className} ${isCreating ? 'opacity-50 cursor-not-allowed' : ''}`}
        title={`Crear ${alertTypeLabels[alertType]}`}
      >
        {isCreating ? (
          <div className={`${sizeClasses[size]} animate-spin border-2 border-current border-t-transparent rounded-full`} />
        ) : (
          <Plus className={sizeClasses[size]} />
        )}
      </button>
    </>
  );
};

export default QuickAlertButton;

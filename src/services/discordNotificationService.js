export class DiscordNotificationService {
  constructor() {
    this.retryDelay = 1000; // Start with 1 second delay
    this.maxRetries = 3;
  }

  /**
   * Send an alert notification to Discord via webhook
   * @param {string} webhookUrl - Discord webhook URL
   * @param {object} alert - Alert object containing player and alert data
   */
  async sendAlert(webhookUrl, alert) {
    if (!webhookUrl || !alert) {
      throw new Error('Discord webhook URL and alert data are required');
    }

    const embed = this.createAlertEmbed(alert);
    
    const payload = {
      username: 'LaLiga Fantasy Alert',
      avatar_url: 'https://github.com/user-attachments/assets/your-logo-here', // You can replace with your logo
      embeds: [embed]
    };

    return this.sendWithRetry(webhookUrl, payload);
  }

  /**
   * Create a Discord embed for the alert
   * @param {object} alert - Alert object
   * @returns {object} Discord embed object
   */
  createAlertEmbed(alert) {
    const alertTypeData = this.getAlertTypeData(alert.type);
    
    const embed = {
      title: `🔔 ${alertTypeData.title}`,
      color: alertTypeData.color,
      timestamp: new Date().toISOString(),
      footer: {
        text: 'LaLiga Fantasy Alert System',
        icon_url: 'https://github.com/user-attachments/assets/your-small-logo-here'
      },
      fields: [
        {
          name: '👤 Jugador',
          value: alert.playerName || 'Desconocido',
          inline: true
        },
        {
          name: '⚽ Equipo',
          value: alert.playerTeam || 'N/A',
          inline: true
        },
        {
          name: '📊 Tipo de Alerta',
          value: alertTypeData.description,
          inline: true
        }
      ]
    };

    // Add player image if available
    if (alert.playerImage) {
      embed.thumbnail = {
        url: alert.playerImage
      };
    }

    // Add specific fields based on alert type
    this.addAlertSpecificFields(embed, alert);

    // Add custom message if provided
    if (alert.message && alert.message.trim()) {
      embed.description = `💭 **Nota personal:** ${alert.message}`;
    }

    return embed;
  }

  /**
   * Get alert type specific data (color, title, description)
   * @param {string} alertType - Type of alert
   * @returns {object} Alert type data
   */
  getAlertTypeData(alertType) {
    const alertTypes = {
      'clause_available': {
        title: 'Cláusula Disponible',
        description: 'La cláusula del jugador está ahora disponible',
        color: 0x0099ff, // Blue
        emoji: '🛡️'
      },
      'market_listing': {
        title: 'Jugador en Mercado',
        description: 'El jugador ha aparecido en el mercado de hoy',
        color: 0xff9900, // Orange
        emoji: '🏪'
      },
      'price_change': {
        title: 'Cambio de Precio',
        description: 'El precio del jugador ha alcanzado el valor objetivo',
        color: 0x00ff99, // Green
        emoji: '📈'
      },
      'clause_unlock': {
        title: 'Cláusula Desbloqueada',
        description: 'La cláusula del jugador se ha desbloqueado',
        color: 0x0099ff, // Blue
        emoji: '🔓'
      }
    };

    return alertTypes[alertType] || {
      title: 'Alerta General',
      description: 'Alerta personalizada',
      color: 0x666666, // Gray
      emoji: '🔔'
    };
  }

  /**
   * Add specific fields to embed based on alert type
   * @param {object} embed - Discord embed object
   * @param {object} alert - Alert object
   */
  addAlertSpecificFields(embed, alert) {
    switch (alert.type) {
      case 'clause_available':
      case 'clause_unlock':
        if (alert.targetValue) {
          embed.fields.push({
            name: '💰 Valor de Cláusula',
            value: `€${parseInt(alert.targetValue).toLocaleString('es-ES')}`,
            inline: true
          });
        }
        break;

      case 'market_listing':
        embed.fields.push({
          name: '📅 Fecha',
          value: new Date().toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          }),
          inline: true
        });
        break;

      case 'price_change':
        if (alert.targetValue) {
          embed.fields.push({
            name: '🎯 Precio Objetivo',
            value: `€${parseInt(alert.targetValue).toLocaleString('es-ES')}`,
            inline: true
          });
        }
        if (alert.triggerData?.currentPrice) {
          embed.fields.push({
            name: '💵 Precio Actual',
            value: `€${parseInt(alert.triggerData.currentPrice).toLocaleString('es-ES')}`,
            inline: true
          });
        }
        break;
      
      default:
        // No specific fields for this alert type
        break;
    }

    // Add creation date
    if (alert.createdAt) {
      const createdDate = new Date(alert.createdAt).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
      embed.fields.push({
        name: '📝 Alerta Creada',
        value: createdDate,
        inline: true
      });
    }
  }

  /**
   * Send webhook with retry mechanism
   * @param {string} webhookUrl - Discord webhook URL
   * @param {object} payload - Payload to send
   * @param {number} retryCount - Current retry count
   */
  async sendWithRetry(webhookUrl, payload, retryCount = 0) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        // Handle rate limiting
        if (response.status === 429 && retryCount < this.maxRetries) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '1') * 1000;
          await this.sleep(retryAfter);
          return this.sendWithRetry(webhookUrl, payload, retryCount + 1);
        }

        // Handle other errors
        if (response.status >= 400 && response.status < 500) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`Discord API error ${response.status}: ${errorData.message || response.statusText}`);
        }

        // Retry on server errors
        if (response.status >= 500 && retryCount < this.maxRetries) {
          await this.sleep(this.retryDelay * Math.pow(2, retryCount));
          return this.sendWithRetry(webhookUrl, payload, retryCount + 1);
        }

        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      if (retryCount < this.maxRetries) {
        await this.sleep(this.retryDelay * Math.pow(2, retryCount));
        return this.sendWithRetry(webhookUrl, payload, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * Test Discord webhook connection
   * @param {string} webhookUrl - Discord webhook URL
   * @returns {Promise<boolean>} Test result
   */
  async testWebhook(webhookUrl) {
    if (!webhookUrl) {
      throw new Error('Webhook URL is required');
    }

    const testPayload = {
      username: 'LaLiga Fantasy Alert',
      embeds: [{
        title: '✅ Test de Conexión',
        description: 'Tu webhook de Discord está funcionando correctamente!',
        color: 0x00ff00,
        timestamp: new Date().toISOString(),
        footer: {
          text: 'LaLiga Fantasy Alert System - Test'
        }
      }]
    };

    try {
      await this.sendWithRetry(webhookUrl, testPayload);
      return true;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Validate Discord webhook URL format
   * @param {string} webhookUrl - Webhook URL to validate
   * @returns {boolean} Whether URL is valid
   */
  isValidWebhookUrl(webhookUrl) {
    if (!webhookUrl || typeof webhookUrl !== 'string') {
      return false;
    }

    const webhookPattern = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/;
    return webhookPattern.test(webhookUrl);
  }

  /**
   * Sleep function for delays
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Send a batch of alerts (for multiple alerts triggered at once)
   * @param {string} webhookUrl - Discord webhook URL
   * @param {Array} alerts - Array of alert objects
   */
  async sendBatchAlerts(webhookUrl, alerts) {
    if (!alerts || alerts.length === 0) return;

    if (alerts.length === 1) {
      return this.sendAlert(webhookUrl, alerts[0]);
    }

    // Create a summary embed for multiple alerts
    const embed = {
      title: `🔔 ${alerts.length} Alertas Activadas`,
      color: 0xff6b35,
      timestamp: new Date().toISOString(),
      description: `Se han activado múltiples alertas:`,
      fields: alerts.slice(0, 10).map((alert, index) => ({
        name: `${index + 1}. ${alert.playerName}`,
        value: `${this.getAlertTypeData(alert.type).description}${alert.playerTeam ? ` (${alert.playerTeam})` : ''}`,
        inline: false
      })),
      footer: {
        text: `LaLiga Fantasy Alert System${alerts.length > 10 ? ` - Mostrando 10 de ${alerts.length}` : ''}`
      }
    };

    const payload = {
      username: 'LaLiga Fantasy Alert',
      embeds: [embed]
    };

    return this.sendWithRetry(webhookUrl, payload);
  }
}

export default DiscordNotificationService;
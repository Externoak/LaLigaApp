import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from '../../utils/motionShim';
import { X, ExternalLink, Check, AlertCircle, TestTube } from 'lucide-react';
import { DiscordNotificationService } from '../../services/discordNotificationService';
import toast from 'react-hot-toast';

const DiscordWebhookSetup = ({ isOpen, onClose, onWebhookSaved }) => {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [discordService] = useState(() => new DiscordNotificationService());

  useEffect(() => {
    if (isOpen) {
      // Load saved webhook
      const saved = localStorage.getItem('discord_webhook_default');
      if (saved) {
        setWebhookUrl(saved);
      }
    }
  }, [isOpen]);

  const testWebhook = async () => {
    if (!webhookUrl) {
      toast.error('Ingresa una URL de webhook');
      return;
    }

    if (!discordService.isValidWebhookUrl(webhookUrl)) {
      toast.error('La URL del webhook no es válida');
      return;
    }

    setIsTestingWebhook(true);
    try {
      await discordService.testWebhook(webhookUrl);
      toast.success('✅ Webhook de Discord funciona correctamente!');
    } catch (error) {
      toast.error(`❌ Error al probar webhook: ${error.message}`);
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const saveWebhook = async () => {
    if (!webhookUrl) {
      toast.error('Ingresa una URL de webhook');
      return;
    }

    if (!discordService.isValidWebhookUrl(webhookUrl)) {
      toast.error('La URL del webhook no es válida');
      return;
    }

    setIsSaving(true);
    try {
      // Test the webhook first
      await discordService.testWebhook(webhookUrl);
      
      // Save to localStorage
      localStorage.setItem('discord_webhook_default', webhookUrl);
      
      toast.success('✅ Webhook guardado correctamente!');
      
      if (onWebhookSaved) {
        onWebhookSaved(webhookUrl);
      }
      
      onClose();
    } catch (error) {
      toast.error(`❌ Error al guardar webhook: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white dark:bg-dark-card rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Configurar Discord Webhook
            </h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Instructions */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                    ¿Cómo crear un webhook de Discord?
                  </h3>
                  <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
                    <li>Ve a tu servidor de Discord</li>
                    <li>Haz clic derecho en el canal donde quieres recibir alertas</li>
                    <li>Selecciona "Editar canal" → "Integraciones"</li>
                    <li>Haz clic en "Crear Webhook"</li>
                    <li>Copia la URL del webhook y pégala aquí</li>
                  </ol>
                  <a
                    href="https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm mt-2"
                  >
                    Ver guía completa
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>

            {/* Webhook URL Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                URL del Webhook de Discord
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="w-full input-field"
                placeholder="https://discord.com/api/webhooks/..."
                autoFocus
              />
              {webhookUrl && !discordService.isValidWebhookUrl(webhookUrl) && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                  La URL no parece ser válida. Debe empezar con https://discord.com/api/webhooks/
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3 pt-4">
              <div className="flex gap-3">
                <button
                  onClick={testWebhook}
                  disabled={!webhookUrl || !discordService.isValidWebhookUrl(webhookUrl) || isTestingWebhook}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
                >
                  <TestTube className="w-4 h-4" />
                  {isTestingWebhook ? 'Probando...' : 'Probar'}
                </button>
                
                <button
                  onClick={saveWebhook}
                  disabled={!webhookUrl || !discordService.isValidWebhookUrl(webhookUrl) || isSaving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
                >
                  <Check className="w-4 h-4" />
                  {isSaving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>

              <button
                onClick={onClose}
                className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancelar
              </button>
            </div>

            {/* Current Status */}
            {localStorage.getItem('discord_webhook_default') && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                  <Check className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    Ya tienes un webhook configurado
                  </span>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default DiscordWebhookSetup;

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from '../../utils/motionShim';
import {
  Download,
  RefreshCw,
  X,
  AlertTriangle,
  Clock
} from 'lucide-react';
import updateService from '../../services/updateService';
import toast from 'react-hot-toast';

const UpdateChecker = () => {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);

  useEffect(() => {
    // Auto-check for updates on component mount (no toast notification)
    checkForUpdates(false);

    // Listen for periodic update notifications
    const handleUpdateAvailable = (event) => {
      const updateInfo = event.detail;
      setUpdateInfo(updateInfo);
      if (updateInfo.updateAvailable) {
        setShowUpdateModal(true);
        toast.success('¡Nueva versión disponible!', {
          duration: 5000,
          icon: '🚀'
        });
      }
    };

    window.addEventListener('updateAvailable', handleUpdateAvailable);

    // Listen for Electron update progress
    let progressUnsubscribe = null;
    if (window.electronAPI?.onUpdateProgress) {
      progressUnsubscribe = window.electronAPI.onUpdateProgress((progressData) => {
        
        if (progressData.step === 'download') {
          setUpdateProgress(Math.round(progressData.progress * 0.4)); // Download is 40% of total
        } else if (progressData.step === 'extract') {
          setUpdateProgress(40 + Math.round(progressData.progress * 0.2)); // Extract is 20% of total
        } else if (progressData.step === 'backup') {
          setUpdateProgress(60 + Math.round(progressData.progress * 0.1)); // Backup is 10% of total
        } else if (progressData.step === 'replace') {
          setUpdateProgress(70 + Math.round(progressData.progress * 0.2)); // Replace is 20% of total
        } else if (progressData.step === 'complete') {
          setUpdateProgress(100);
          toast.success(progressData.message || 'Actualización completada');
        } else if (progressData.step === 'error') {
          setUpdateProgress(0);
          setIsUpdating(false);
          toast.error(progressData.message || 'Error en la actualización');
        }

        // Show progress messages as toasts for better UX
        if (progressData.message && progressData.step !== 'error' && progressData.step !== 'complete') {
          toast.loading(progressData.message, {
            id: 'update-progress',
            duration: Infinity
          });
        }
      });
    }

    // Start periodic checks (every 6 hours)
    updateService.startPeriodicUpdateChecks(6);

    return () => {
      window.removeEventListener('updateAvailable', handleUpdateAvailable);
      if (progressUnsubscribe) {
        progressUnsubscribe();
      }
      if (window.electronAPI?.removeAllUpdateListeners) {
        window.electronAPI.removeAllUpdateListeners();
      }
    };
  }, []);

  const checkForUpdates = async (showToastOnUpdate = true) => {
    setIsChecking(true);
    try {
      const info = await updateService.checkForUpdates();
      setUpdateInfo(info);

      if (info.updateAvailable) {
        setShowUpdateModal(true);
        // Only show toast if explicitly requested (manual check)
        if (showToastOnUpdate) {
          toast.success('¡Nueva versión disponible!');
        }
      } else if (!info.error && showToastOnUpdate) {
        toast.success('La aplicación está actualizada');
      } else if (info.error && showToastOnUpdate) {
        toast.error('Error al verificar actualizaciones');
      }
    } catch (error) {
      if (showToastOnUpdate) {
        toast.error('Error al verificar actualizaciones');
      }
    } finally {
      setIsChecking(false);
    }
  };

  const handleUpdate = async () => {
    if (!updateInfo || !updateInfo.updateAvailable) return;

    setIsUpdating(true);
    setUpdateProgress(0);

    // Disable all user interactions during update
    document.body.style.pointerEvents = 'none';
    document.body.style.userSelect = 'none';

    try {
      // Dismiss any existing progress toasts
      toast.dismiss('update-progress');

            
      // Show initial progress with small delay to ensure UI updates
      setUpdateProgress(5);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Simulate progressive steps for better UX (even if the actual download is faster)
      const progressSteps = [10, 15, 20, 25];
      for (const step of progressSteps) {
        setUpdateProgress(step);
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      const result = await updateService.downloadAndApplyUpdate(updateInfo);

      
      if (result && result.success) {
        // Dismiss progress toast and show success
        toast.dismiss('update-progress');
        toast.success(result.message || 'Actualización completada');

        // For Electron updates, the restart is handled automatically
        // For web updates, we might need to handle restart manually
        if (result.requiresRestart) {
          // Show countdown for restart
          let countdown = 3;
          const countdownToast = toast.loading(`La aplicación se reiniciará en ${countdown} segundos...`, {
            duration: Infinity
          });

          const countdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
              toast.loading(`La aplicación se reiniciará en ${countdown} segundos...`, {
                id: countdownToast
              });
            } else {
              clearInterval(countdownInterval);
              toast.dismiss(countdownToast);
              updateService.restartApp(result.restartMethod);
            }
          }, 1000);
        }

        // Close modal after successful update
        setShowUpdateModal(false);
      } else {
        // Avoid creating new Error objects that might cause recursion
        const errorMsg = (result && result.error) || 'Update failed - no result returned';

        // If it's already a stack overflow error, don't wrap it in another Error
        if (typeof errorMsg === 'string' && errorMsg.includes('Maximum call stack size exceeded')) {
          throw new Error(`Stack overflow error: ${errorMsg}`);
        } else {
          throw new Error(errorMsg);
        }
      }
    } catch (error) {

      // Dismiss progress toast and show error
      toast.dismiss('update-progress');

      // Prevent recursive error handling for stack overflow errors
      let errorMessage = 'Error desconocido';
      if (error && typeof error.message === 'string') {
        if (error.message.includes('Maximum call stack size exceeded')) {
          errorMessage = 'Error interno del sistema. Intente reiniciar la aplicación.';
        } else {
          errorMessage = error.message.substring(0, 100);
        }
      }

      toast.error(`Error al actualizar: ${errorMessage}`);

      setUpdateProgress(0);
      setIsUpdating(false);
    } finally {
      // Ensure we always reset the updating state and re-enable interactions
      setIsUpdating(false);
      setUpdateProgress(0);

      // Re-enable user interactions
      document.body.style.pointerEvents = 'auto';
      document.body.style.userSelect = 'auto';
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC'
    });
  };

  const formatReleaseNotes = (notes) => {
    if (!notes) return [];

    // Process release notes while preserving UTF-8 characters
    return notes
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        // Normalize and preserve the original text
        let trimmedLine = line.trim();

        // Ensure proper Unicode handling
        if (typeof trimmedLine === 'string') {
          // Normalize Unicode characters to ensure proper display
          trimmedLine = trimmedLine.normalize('NFC');
        }

        return trimmedLine;
      })
      ; // Show all release notes lines - no limit
  };

  return (
    <>
      {/* Update Check Button */}
      <button
        onClick={() => checkForUpdates(true)}
        disabled={isChecking}
        className="relative p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
        title="Buscar actualizaciones"
      >
        <RefreshCw className={`w-5 h-5 ${isChecking ? 'animate-spin' : ''}`} />

        {/* Update Available Indicator */}
        {updateInfo?.updateAvailable && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
        )}
      </button>

      {/* Update Modal */}
      <AnimatePresence>
        {showUpdateModal && updateInfo?.updateAvailable && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            style={{ zIndex: 9999, backdropFilter: 'blur(2px)' }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col mt-[5%] mx-auto my-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <Download className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Actualización Disponible
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Versión {updateInfo.latestVersion}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowUpdateModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {/* Version Info */}
                <div className="flex justify-between items-center mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Versión actual</p>
                    <p className="font-medium text-gray-900 dark:text-white">{updateInfo.currentVersion}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Nueva versión</p>
                    <p className="font-medium text-green-600 dark:text-green-400">{updateInfo.latestVersion}</p>
                  </div>
                </div>

                {/* Release Date */}
                {updateInfo.publishedAt && (
                  <div className="flex items-center gap-2 mb-4 text-sm text-gray-600 dark:text-gray-400">
                    <Clock className="w-4 h-4" />
                    <span>Publicado el {formatDate(updateInfo.publishedAt)}</span>
                  </div>
                )}

                {/* Release Notes */}
                {updateInfo.releaseNotes && (
                  <div className="mb-4">
                    <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                      Novedades:
                    </p>
                    <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2 pr-2 break-words">
                      {formatReleaseNotes(updateInfo.releaseNotes).map((note, index) => (
                        <p key={index} className="leading-relaxed whitespace-pre-wrap break-words" style={{ unicodeBidi: 'normal' }}>
                          {note.startsWith('-') || note.startsWith('*') || note.startsWith('•') ? note : `• ${note}`}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Update Progress */}
                {isUpdating && (
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Actualizando...
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {updateProgress}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <motion.div
                        className="bg-blue-600 h-2 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${updateProgress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
                <button
                  onClick={() => setShowUpdateModal(false)}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isUpdating}
                >
                  {isUpdating ? 'Actualizando...' : 'Más tarde'}
                </button>

                <button
                  onClick={handleUpdate}
                  disabled={isUpdating}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {isUpdating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Actualizando...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Actualizar Ahora
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full Screen Update Overlay */}
      <AnimatePresence>
        {isUpdating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-75 z-[9999] flex items-center justify-center p-4 min-h-screen"
            style={{
              backdropFilter: 'blur(4px)'
            }}
            onClick={(e) => e.preventDefault()} // Prevent accidental clicks
            onContextMenu={(e) => e.preventDefault()} // Disable right-click
            onKeyDown={(e) => e.preventDefault()} // Disable keyboard shortcuts
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 select-none w-96 max-w-[90vw] max-h-[70vh] overflow-y-auto m-auto"
            >
              {/* Update Icon */}
              <div className="text-center mb-6">
                <div className="inline-flex p-4 bg-blue-100 dark:bg-blue-900/30 rounded-full mb-4">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  >
                    <RefreshCw className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                  </motion.div>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  Actualizando LaLiga Fantasy
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Por favor, no cierre la aplicación durante este proceso
                </p>
              </div>

              {/* Progress Bar */}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {updateProgress < 20 ? 'Descargando actualización...' :
                     updateProgress < 40 ? 'Preparando instalación...' :
                     updateProgress < 60 ? 'Extrayendo archivos...' :
                     updateProgress < 80 ? 'Creando respaldo...' :
                     updateProgress < 95 ? 'Aplicando cambios...' :
                     'Finalizando actualización...'}
                  </span>
                  <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                    {updateProgress}%
                  </span>
                </div>

                {/* Animated Progress Bar */}
                <div className="relative w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full shadow-sm"
                    initial={{ width: 0 }}
                    animate={{ width: `${updateProgress}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                  {/* Shimmer effect */}
                  {updateProgress > 0 && updateProgress < 100 && (
                    <motion.div
                      className="absolute top-0 left-0 h-full w-1/2 bg-gradient-to-r from-transparent via-white via-transparent opacity-20"
                      animate={{ x: ['-100%', '200%'] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    />
                  )}
                </div>
              </div>

              {/* Current Version Info */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Actualizando a la versión
                </p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {updateInfo?.latestVersion || 'Última versión'}
                </p>
              </div>

              {/* Warning Message */}
              <div className="mt-4 flex items-center gap-2 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <p className="text-xs">
                  <strong>Importante:</strong> No interrumpa este proceso. La aplicación se reiniciará automáticamente al completarse.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default UpdateChecker;


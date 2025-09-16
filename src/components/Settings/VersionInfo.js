import React, { useState } from 'react';
import { motion } from '../../utils/motionShim';
import {
  Download,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Info,
  ExternalLink
} from 'lucide-react';
import updateService from '../../services/updateService';
import toast from 'react-hot-toast';

const VersionInfo = () => {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const currentVersion = updateService.getCurrentVersion();

  const checkForUpdates = async () => {
    setIsChecking(true);
    try {
      const info = await updateService.checkForUpdates();
      setUpdateInfo(info);

      if (info.updateAvailable) {
        toast.success('¡Nueva versión disponible!');
      } else if (!info.error) {
        toast.success('La aplicación está actualizada');
      } else {
        toast.error('Error al verificar actualizaciones');
      }
    } catch (error) {
      toast.error('Error al verificar actualizaciones');
    } finally {
      setIsChecking(false);
    }
  };

  const handleUpdate = async () => {
    if (!updateInfo || !updateInfo.updateAvailable) return;

    setIsUpdating(true);
    try {
      const result = await updateService.downloadAndApplyUpdate(updateInfo);

      if (result.success) {
        toast.success(result.message || 'Actualización completada');

        if (result.requiresRestart) {
          setTimeout(() => {
            updateService.restartApp(result.restartMethod);
          }, 2000);
        }
      } else {
        throw new Error(result.error || 'Update failed');
      }
    } catch (error) {
      toast.error(`Error al actualizar: ${error.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
          <Info className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Información de la Aplicación
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Versión actual y actualizaciones
          </p>
        </div>
      </div>

      {/* Current Version */}
      <div className="space-y-4">
        <div className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Versión Actual
            </p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              v{currentVersion}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={checkForUpdates}
              disabled={isChecking}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
              {isChecking ? 'Verificando...' : 'Buscar Actualizaciones'}
            </button>
          </div>
        </div>

        {/* Update Status */}
        {updateInfo && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-lg border-l-4 ${
              updateInfo.updateAvailable
                ? 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-400'
                : updateInfo.error
                ? 'bg-red-50 dark:bg-red-900/30 border-red-400'
                : 'bg-green-50 dark:bg-green-900/30 border-green-400'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-1">
                {updateInfo.updateAvailable ? (
                  <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                ) : updateInfo.error ? (
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                )}
              </div>

              <div className="flex-1">
                {updateInfo.updateAvailable ? (
                  <>
                    <h4 className="font-medium text-yellow-800 dark:text-yellow-200">
                      Nueva versión disponible: v{updateInfo.latestVersion}
                    </h4>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                      {updateInfo.publishedAt && `Publicada el ${formatDate(updateInfo.publishedAt)}`}
                    </p>
                    {updateInfo.releaseNotes && (
                      <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded border">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Novedades:
                        </p>
                        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1 max-h-32 overflow-y-auto">
                          {updateInfo.releaseNotes.split('\n').slice(0, 3).map((line, index) => (
                            <p key={index} className="leading-relaxed">
                              {line.trim().startsWith('-') || line.trim().startsWith('*') ? line : `• ${line}`}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-3 mt-4">
                      <button
                        onClick={handleUpdate}
                        disabled={isUpdating}
                        className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 text-white rounded-lg transition-colors text-sm"
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
                      {updateInfo.downloadUrl && (
                        <a
                          href={updateInfo.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Ver en GitHub
                        </a>
                      )}
                    </div>
                  </>
                ) : updateInfo.error ? (
                  <>
                    <h4 className="font-medium text-red-800 dark:text-red-200">
                      Error al verificar actualizaciones
                    </h4>
                    <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                      {updateInfo.error}
                    </p>
                  </>
                ) : (
                  <>
                    <h4 className="font-medium text-green-800 dark:text-green-200">
                      La aplicación está actualizada
                    </h4>
                    <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                      Tienes la versión más reciente: v{currentVersion}
                    </p>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* App Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-center md:text-left">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              LaLiga Fantasy Web
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              Aplicación no oficial para La Liga Fantasy
            </p>
          </div>
          <div className="text-center md:text-right">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {updateService.isElectron ? 'Aplicación Electron' : 'Aplicación Web'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              React {React.version}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VersionInfo;

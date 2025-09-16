import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { fantasyAPI } from '../../services/api';
import { Trophy, Users, Calendar, Loader, RefreshCw, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import CorsInstructions from '../Common/CorsInstructions';

const LeagueSelector = () => {
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [corsError, setCorsError] = useState(false);
  const { setLeague, logout } = useAuthStore();

  const fetchLeagues = async () => {
    setLoading(true);
    setCorsError(false);
    try {
      const response = await fantasyAPI.getLeagues();
      
      if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
        toast.error('❌ No se encontraron ligas para tu cuenta');
        setLeagues([]);
        return;
      }
      
      setLeagues(response.data);
      toast.success(`✅ ${response.data.length} liga(s) encontrada(s)`);
    } catch (error) {
      
      // Detectar errores CORS
      if (error.code === 'ERR_NETWORK' || 
          error.message?.includes('CORS') || 
          !error.response) {
        setCorsError(true);
        toast.error('❌ Error CORS: Necesitas configurar un proxy o deshabilitar CORS');
      } else if (error.response?.status === 401) {
        toast.error('❌ Token no válido o expirado. Ve a fantasy.laliga.com, obtén un token Bearer válido y úsalo en el login JSON.');
      } else if (error.response?.status === 500) {
        toast.error('❌ Error 500 del servidor de La Liga Fantasy. Este endpoint puede estar caído o requerir parámetros específicos.');
      } else {
        toast.error(`❌ Error ${error.response?.status || 'desconocido'}: ${error.response?.data?.message || error.message}`);
      }
      setLeagues([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLeagues();
  }, []);

  const handleLeagueSelect = (league) => {
    setLeague(league.id, league.name);
    toast.success(`🏆 Liga seleccionada: ${league.name}`);
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('👋 Sesión cerrada correctamente');
    } catch (error) {
      toast.error('❌ Error al cerrar sesión');
    }
  };

  const formatDate = (dateString) => {
    try {
      return new Date(dateString).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return 'Fecha no disponible';
    }
  };

  const getLeagueTypeIcon = (type) => {
    const typeString = typeof type === 'string' ? type : type?.id || '';
    switch (typeString.toLowerCase()) {
      case 'public':
        return <Users className="w-4 h-4" />;
      case 'private':
        return <Trophy className="w-4 h-4" />;
      default:
        return <Calendar className="w-4 h-4" />;
    }
  };

  // Mostrar instrucciones CORS si hay error
  if (corsError) {
    return <CorsInstructions onTryAgain={fetchLeagues} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg flex items-center justify-center px-4">
        <div className="card p-8 w-full max-w-md mx-auto text-center">
          <Loader className="w-12 h-12 animate-spin mx-auto mb-4 text-primary-500" />
          <h2 className="text-xl font-bold mb-2">Cargando tus ligas...</h2>
          <p className="text-gray-500">Conectando con La Liga Fantasy API</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg flex items-center justify-center px-4">
      <div className="w-full max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gradient mb-2">La Liga Fantasy</h1>
          <p className="text-gray-600 dark:text-gray-400">Selecciona una liga para continuar</p>
        </div>

        {leagues.length === 0 ? (
          <div className="card p-8 text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trophy className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold mb-2">No hay ligas disponibles</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              No se encontraron ligas asociadas a tu cuenta. Verifica que el token sea correcto o crea una liga en La Liga Fantasy.
            </p>
            <button
              onClick={fetchLeagues}
              className="btn-primary inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Intentar de nuevo
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {leagues.map((league) => (
              <div
                key={league.id}
                className="card p-6 hover:shadow-lg transition-all duration-200 cursor-pointer border-2 border-transparent hover:border-primary-200 dark:hover:border-primary-800"
                onClick={() => handleLeagueSelect(league)}
              >
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                    {getLeagueTypeIcon(league.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg leading-tight mb-1 truncate" title={league.name}>
                      {league.name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      ID: {league.id}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  {league.totalTeams && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Equipos:</span>
                      <span className="font-medium">{league.totalTeams}</span>
                    </div>
                  )}
                  
                  {league.maxTeams && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Máximo:</span>
                      <span className="font-medium">{league.maxTeams}</span>
                    </div>
                  )}
                  
                  {league.createdDate && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Creada:</span>
                      <span className="font-medium text-xs">{formatDate(league.createdDate)}</span>
                    </div>
                  )}
                  
                  {league.status && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Estado:</span>
                      <span className={`font-medium text-xs px-2 py-1 rounded-full ${
                        league.status.toLowerCase() === 'active' 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                      }`}>
                        {league.status}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Seleccionar liga</span>
                    <div className="w-6 h-6 rounded-full bg-primary-500 text-white flex items-center justify-center">
                      →
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="text-center mt-8 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={fetchLeagues}
              disabled={loading}
              className="btn-secondary inline-flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar ligas
            </button>
            <button
              onClick={handleLogout}
              className="btn-outline inline-flex items-center gap-2 text-red-600 border-red-600 hover:bg-red-50 dark:text-red-400 dark:border-red-400 dark:hover:bg-red-900/20"
            >
              <LogOut className="w-4 h-4" />
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeagueSelector;

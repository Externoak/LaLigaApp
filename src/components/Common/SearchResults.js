import React from 'react';
import { motion, AnimatePresence } from '../../utils/motionShim';
import { Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const SearchResults = ({ results, query, isVisible, onClose }) => {
  const navigate = useNavigate();

  const handlePlayerClick = (player) => {
    // Navigate to players page with search filter set
    navigate(`/players?search=${encodeURIComponent(player.name)}`);
    onClose();
  };

  const handleLaLigaTeamClick = (team) => {
    // Navigate to LaLiga teams page with team filter
    navigate(`/laliga-teams?team=${encodeURIComponent(team.name)}`);
    onClose();
  };

  const handleFantasyTeamClick = (team) => {
    // Navigate to teams page with team filter (showing only selected team)
    navigate(`/teams?search=${encodeURIComponent(team.manager)}`);
    onClose();
  };

  if (!isVisible || !query.trim()) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
        className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto min-w-[300px]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-dark-border">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Resultados para "{query}"
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {results.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              No se encontraron resultados
            </p>
          </div>
        ) : (
          <div className="p-2">
            {/* LaLiga Teams Section - Now First */}
            {results.filter(r => r.type === 'laliga-team').length > 0 && (
              <div className="mb-2">
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-2 py-1">
                  Equipos de la Liga
                </h4>
                {results
                  .filter(r => r.type === 'laliga-team')
                  .map((team, index) => (
                    <motion.button
                      key={`laliga-team-${team.id || index}`}
                      onClick={() => handleLaLigaTeamClick(team)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                      whileHover={{ x: 4 }}
                      transition={{ duration: 0.1 }}
                    >
                      <div className="flex-shrink-0">
                        {team.badgeColor ? (
                          <img
                            src={team.badgeColor}
                            alt={team.name}
                            className="w-8 h-8 rounded-full object-contain"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.parentNode.innerHTML = `<div class="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center"><svg class="w-4 h-4 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></div>`;
                            }}
                          />
                        ) : (
                          <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {team.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {team.playerCount} jugadores • Ver equipo →
                        </p>
                      </div>
                    </motion.button>
                  ))}
              </div>
            )}

            {/* Players Section - Now Second */}
            {results.filter(r => r.type === 'player').length > 0 && (
              <div className="mb-2">
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-2 py-1">
                  Jugadores
                </h4>
                {results
                  .filter(r => r.type === 'player')
                  .map((player, index) => (
                    <motion.button
                      key={`player-${player.id || index}`}
                      onClick={() => handlePlayerClick(player)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                      whileHover={{ x: 4 }}
                      transition={{ duration: 0.1 }}
                    >
                      <div className="flex-shrink-0">
                        {/* Player Image with Fallback */}
                        {player.images?.transparent?.['256x256'] || player.images?.player || player.photo ? (
                          <img
                            src={player.images?.transparent?.['256x256'] || player.images?.player || player.photo}
                            alt={player.name}
                            className="w-8 h-8 rounded-full object-cover border border-gray-200 dark:border-gray-600"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.parentNode.innerHTML = `<div class="w-8 h-8 bg-gradient-to-br from-primary-300 to-primary-500 rounded-full flex items-center justify-center border border-gray-200 dark:border-gray-600"><span class="text-xs font-bold text-white">${player.name.charAt(0).toUpperCase()}</span></div>`;
                            }}
                          />
                        ) : (
                          <div className="w-8 h-8 bg-gradient-to-br from-primary-300 to-primary-500 rounded-full flex items-center justify-center border border-gray-200 dark:border-gray-600">
                            <span className="text-xs font-bold text-white">
                              {player.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {player.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {player.team || player.club} • {player.position}
                        </p>
                      </div>
                      {player.marketValue && (
                        <div className="text-xs text-primary-600 dark:text-primary-400 font-medium">
                          {player.marketValue}€
                        </div>
                      )}
                    </motion.button>
                  ))}
              </div>
            )}


            {/* Fantasy Teams Section */}
            {results.filter(r => r.type === 'fantasy-team').length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-2 py-1">
                  Equipos Fantasy
                </h4>
                {results
                  .filter(r => r.type === 'fantasy-team')
                  .map((team, index) => (
                    <motion.button
                      key={`fantasy-team-${team.id || index}`}
                      onClick={() => handleFantasyTeamClick(team)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                      whileHover={{ x: 4 }}
                      transition={{ duration: 0.1 }}
                    >
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
                          <Users className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {team.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {team.manager || team.owner}
                        </p>
                      </div>
                      {team.points && (
                        <div className="text-xs text-primary-600 dark:text-primary-400 font-medium">
                          {team.points} pts
                        </div>
                      )}
                    </motion.button>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {results.length > 0 && (
          <div className="p-2 border-t border-gray-100 dark:border-dark-border">
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              Mostrando {results.length} resultado{results.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default SearchResults;

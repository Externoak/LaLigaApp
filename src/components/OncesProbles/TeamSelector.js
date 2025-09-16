import React from 'react';
import { Users, Clock } from 'lucide-react';

const TeamSelector = ({ teams, selectedTeam, onTeamSelect, loading = false }) => {
  // Get team logo from futbolfantasy.com or fallback
  const getTeamLogo = (team) => {
    // If team object has badgeColor, use it (from real API data)
    if (team?.badgeColor) {
      return team.badgeColor;
    }
    
    // Use futbolfantasy.com logo if team has logoId
    if (team?.logoId) {
      return `https://static.futbolfantasy.com/uploads/images/cabecera/hd/${team.logoId}.png`;
    }
    
    // Fallback for team slug matching
    const teamSlug = typeof team === 'string' ? team : team?.slug;
    
    // Team logo ID mapping for futbolfantasy.com
    const logoIdMap = {
      'alaves': '28',
      'athletic': '1',
      'atletico': '2',
      'barcelona': '3',
      'betis': '4',
      'celta': '5',
      'elche': '21',
      'espanyol': '7',
      'getafe': '8',
      'girona': '30',
      'levante': '10',
      'mallorca': '12',
      'osasuna': '13',
      'rayo-vallecano': '14',
      'real-madrid': '15',
      'real-oviedo': '43',
      'real-sociedad': '16',
      'sevilla': '17',
      'valencia': '18',
      'villarreal': '22'
    };
    
    const logoId = logoIdMap[teamSlug];
    if (logoId) {
      return `https://static.futbolfantasy.com/uploads/images/cabecera/hd/${logoId}.png`;
    }
    
    return `https://via.placeholder.com/64x64?text=${(teamSlug || 'T').charAt(0).toUpperCase()}`;
  };

  const handleTeamClick = (teamSlug) => {
    if (loading) return;
    onTeamSelect(teamSlug);
  };

  return (
    <div className="bg-white dark:bg-dark-card rounded-lg p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Users className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          Selecciona un equipo
        </h2>
        
        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Clock className="w-4 h-4 animate-pulse" />
            <span>Cargando...</span>
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
        {teams.map((team) => (
          <button
            key={team.slug}
            onClick={() => handleTeamClick(team.slug)}
            disabled={loading}
            className={`group relative p-4 rounded-xl border-2 transition-all duration-300 transform hover:scale-105 ${
              selectedTeam === team.slug
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 shadow-lg shadow-primary-500/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
            } ${loading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            title={team.fullName}
          >
            {/* Team Logo */}
            <div className="relative mb-2">
              <img
                src={getTeamLogo(team)}
                alt={team.name}
                className={`w-12 h-12 mx-auto object-contain transition-all duration-300 ${
                  selectedTeam === team.slug ? 'filter drop-shadow-lg' : 'group-hover:scale-110'
                }`}
                onError={(e) => {
                  // Fallback to text if image fails to load
                  e.target.style.display = 'none';
                  e.target.nextElementSibling.style.display = 'flex';
                }}
              />
              
              {/* Fallback text logo */}
              <div 
                className={`w-12 h-12 mx-auto bg-gradient-to-br from-primary-400 to-primary-600 rounded-full items-center justify-center text-white font-bold text-lg shadow-md ${
                  selectedTeam === team.slug ? 'flex' : 'hidden'
                }`}
                style={{ display: 'none' }}
              >
                {team.name.charAt(0)}
              </div>
            </div>

            {/* Team Name */}
            <div className={`text-xs font-medium text-center transition-colors duration-200 ${
              selectedTeam === team.slug 
                ? 'text-primary-700 dark:text-primary-300' 
                : 'text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-100'
            }`}>
              {team.name}
            </div>

            {/* Selected indicator */}
            {selectedTeam === team.slug && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary-500 rounded-full flex items-center justify-center">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              </div>
            )}

            {/* Hover effect overlay */}
            <div className={`absolute inset-0 rounded-xl bg-gradient-to-t from-transparent via-transparent to-white/5 transition-opacity duration-200 ${
              selectedTeam === team.slug ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}></div>
          </button>
        ))}
      </div>

      {/* Selected team info */}
      {selectedTeam && (
        <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="flex items-center gap-3">
            <img
              src={getTeamLogo(teams.find(t => t.slug === selectedTeam))}
              alt={teams.find(t => t.slug === selectedTeam)?.name}
              className="w-8 h-8 object-contain"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextElementSibling.style.display = 'flex';
              }}
            />
            <div 
              className="w-8 h-8 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full items-center justify-center text-white font-bold text-sm shadow-md hidden"
            >
              {teams.find(t => t.slug === selectedTeam)?.name?.charAt(0)}
            </div>
            
            <div>
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                {teams.find(t => t.slug === selectedTeam)?.fullName}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Alineación probable seleccionada
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamSelector;
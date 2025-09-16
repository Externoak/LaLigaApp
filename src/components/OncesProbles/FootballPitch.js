import React from 'react';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Heart, Plus } from 'lucide-react';

const PlayerCard = ({ player, isStarter = true, onPlayerClick }) => {


  const getProbabilityColor = (probability) => {
    if (probability >= 95) return 'text-white bg-purple-600 dark:bg-purple-700';
    if (probability >= 80) return 'text-white bg-blue-600 dark:bg-blue-700';
    if (probability >= 70) return 'text-white bg-orange-500 dark:bg-orange-600';
    if (probability >= 60) return 'text-black bg-yellow-400 dark:bg-yellow-500 dark:text-black';
    return 'text-white bg-red-600 dark:bg-red-700';
  };

  return (
    <div
      className={`group relative ${isStarter ? 'w-28 h-32' : 'w-24 h-28'} cursor-pointer`}
      onClick={() => onPlayerClick && onPlayerClick(player)}
    >
      {/* Player Card */}
      <div className={`relative bg-white dark:bg-dark-card rounded-lg shadow-md border-2 transition-all duration-200 hover:shadow-lg hover:scale-105 ${
        isStarter 
          ? 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600' 
          : 'border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500'
      } ${isStarter ? 'p-2' : 'p-1.5'}`}>

        {/* Player Image */}
        <div className={`${isStarter ? 'w-16 h-16' : 'w-14 h-14'} mx-auto mb-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden`}>
          {(player.playerMaster?.images?.transparent?.['256x256'] || player.images?.transparent?.['256x256']) ? (
            <img
              src={player.playerMaster?.images?.transparent?.['256x256'] || player.images?.transparent?.['256x256']}
              alt={player.playerMaster?.nickname || player.playerMaster?.name || player.name || player.nickname}
              className="w-full h-full object-cover rounded-full"
              onError={(e) => {
                e.target.style.display = 'none';
                const fontSize = isStarter ? 'text-xl' : 'text-lg';
                e.target.parentNode.innerHTML = `<div class="w-full h-full bg-primary-500 rounded-full flex items-center justify-center text-white ${fontSize} font-bold">${(player.playerMaster?.nickname || player.playerMaster?.name || player.name || player.nickname || 'P').charAt(0)}</div>`;
              }}
            />
          ) : (
            <div className={`w-full h-full bg-primary-500 rounded-full flex items-center justify-center text-white ${isStarter ? 'text-xl' : 'text-lg'} font-bold`}>
              {(player.playerMaster?.nickname || player.playerMaster?.name || player.name || player.nickname || 'P').charAt(0)}
            </div>
          )}
        </div>

        {/* Player Name */}
        <div className={`text-center ${isStarter ? 'text-lg' : 'text-base'} font-medium text-gray-900 dark:text-gray-100 truncate`}>
          {(() => {
            const displayName = player.playerMaster?.nickname || player.nickname || player.playerMaster?.name || player.name || 'Jugador';
            return displayName.length > 14 ? displayName.substring(0, 14) : displayName;
          })()}
        </div>

        {/* Probability Badge */}
        <div className={`absolute -top-2 -right-2 ${isStarter ? 'w-12 h-12 text-lg' : 'w-10 h-10 text-base'} rounded-full font-bold flex items-center justify-center ${getProbabilityColor(player.probability)}`}>
          {player.probability}%
        </div>

        {/* Fallback player indicator */}
        {player.fallback && (
          <div className="absolute -top-1 -left-1 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold">!</span>
          </div>
        )}

        {/* Health indicators */}
        {/* Red health cross for fully injured players */}
        {(player.playerStatus === 'injured' && player.probability === 0) && (
          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center border border-white">
            <Plus className="w-2.5 h-2.5 text-white" />
          </div>
        )}

        {/* Yellow question mark for doubtful players */}
        {(player.playerStatus === 'injured' && player.probability !== 0) && (
          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-yellow-500 rounded-full flex items-center justify-center border border-white">
            <span className="text-white text-xs font-bold">?</span>
          </div>
        )}


      </div>

      {/* Hover Tooltip */}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
        <div className="bg-black dark:bg-gray-900 text-white text-xs rounded-lg p-2 whitespace-nowrap shadow-lg">
          <div className="font-semibold">
            {player.playerMaster?.name || player.name || 'Jugador'}
            {player.fallback && <span className="text-orange-300 ml-1">(Sin Datos en LaLiga Fantasy)</span>}
          </div>
          <div className="text-gray-300">
            {player.probability}% probabilidad
          </div>
          <div className="text-gray-400">
            {player.fallback ? (
              `${player.position} • Futbolfantasy data`
            ) : (
              `Forma: ${player.playerStatus === 'ok' ? 'Disponible' : player.playerStatus === 'injured' && player.probability !== 0 ? 'Duda' : 'Lesionado'}`
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const FootballPitch = ({ lineupData, loading = false, nextOpponent, onPlayerClick }) => {
  if (loading) {
    return (
      <div className="bg-gradient-to-b from-green-400 to-green-600 rounded-lg p-8 min-h-[600px] flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="font-medium">Cargando alineación...</p>
        </div>
      </div>
    );
  }

  if (!lineupData) {
    return (
      <div className="bg-white dark:bg-dark-card rounded-lg shadow-sm overflow-hidden">
        <div className="p-12 text-center">
          <div className="w-24 h-24 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-6">
            <div className="text-gray-400 dark:text-gray-500 text-4xl">⚽</div>
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">
            No hay datos disponibles
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4 max-w-md mx-auto">
            La funcionalidad de scraping de datos de futbolfantasy.com no está implementada aún.
            Se necesita implementar el parser HTML para extraer la información real de las alineaciones.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            URL destino: https://www.futbolfantasy.com/laliga/equipos/[equipo]
          </p>
        </div>
      </div>
    );
  }

  // Parse formation to get player distribution using positionId
  const formationString = lineupData?.formationString || lineupData?.formationName;


  if (!formationString) {
    return (
      <div className="bg-white dark:bg-dark-card rounded-lg shadow-sm overflow-hidden">
        <div className="p-12 text-center">
          <div className="w-24 h-24 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-6">
            <div className="text-gray-400 dark:text-gray-500 text-4xl">⚽</div>
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">
            Datos incompletos
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4 max-w-md mx-auto">
            Los datos de alineación no contienen información de formación válida.
          </p>
        </div>
      </div>
    );
  }

  const [/* defenders */, /* midfielders */, /* attackers */] = formationString.split('-').map(Number);
  const { starting = [], bench = [] } = lineupData.players || {};

  // Filter to only show players marked as starters
  const starterPlayers = starting.filter(p => p.isStarter === true);
  const benchPlayers = bench.filter(p => p.isStarter === false);

  // Debug: Log what players we have and their positions

  // Separate players by positionId with smart rebalancing for formation
  const allGoalkeepers = starterPlayers.filter(p => p.positionId === 1);
  const allDefenders = starterPlayers.filter(p => p.positionId === 2);
  const allMidfielders = starterPlayers.filter(p => p.positionId === 3);
  const allAttackers = starterPlayers.filter(p => p.positionId === 4);

  // Take only the first goalkeeper (usually the main one)
  const goalkeeper = allGoalkeepers[0];

  // Redistribute excess goalkeepers to fill missing positions
  const excessGoalkeepers = allGoalkeepers.slice(1);

  // Use actual player distribution instead of forcing formation
  let defenderPlayers = [...allDefenders];
  let midfielderPlayers = [...allMidfielders];
  let attackerPlayers = [...allAttackers];

  // Add excess goalkeepers to positions that need players (only if positions are actually missing players)
  excessGoalkeepers.forEach(player => {
    if (defenderPlayers.length === 0) {
      defenderPlayers.push({ ...player, position: 'Defensa', positionId: 2 });
    } else if (midfielderPlayers.length === 0) {
      midfielderPlayers.push({ ...player, position: 'Centrocampista', positionId: 3 });
    } else if (attackerPlayers.length === 0) {
      attackerPlayers.push({ ...player, position: 'Delantero', positionId: 4 });
    }
  });

  // Use all available players instead of limiting to formation
  // This ensures no players are left out due to formation string mismatch

  // Calculate actual formation based on player distribution
  const actualFormation = `${defenderPlayers.length}-${midfielderPlayers.length}-${attackerPlayers.length}`;


  return (
    <div className="bg-white dark:bg-dark-card rounded-lg shadow-sm overflow-hidden">
      {/* Team Header */}
      <div className="p-6 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-gray-200 dark:border-gray-700">
              {lineupData.team.badgeColor ? (
                <img
                  src={lineupData.team.badgeColor}
                  alt={lineupData.team.name}
                  className="w-16 h-16 object-contain bg-white"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.parentNode.innerHTML = `<div class="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-xl font-bold text-gray-600 dark:text-gray-300">${lineupData.team.name.charAt(0)}</div>`;
                  }}
                />
              ) : (
                <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-xl font-bold text-gray-600 dark:text-gray-300">
                  {lineupData.team.name.charAt(0)}
                </div>
              )}
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {lineupData.team.fullName}
              </h3>
              <div className="flex items-center gap-4 mt-1">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Formación: {actualFormation}
                </span>
                {nextOpponent && (
                  <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-full">
                    Próximo: vs {nextOpponent.opponent} ({nextOpponent.isHome ? 'Casa' : 'Fuera'}) - J{nextOpponent.week}
                  </span>
                )}
              </div>
            </div>
          </div>

          {lineupData.coach && (
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Entrenador</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">{lineupData.coach.name}</p>
            </div>
          )}
        </div>
      </div>

      {/* Football Pitch */}
      <div className="relative bg-gradient-to-b from-green-400 via-green-500 to-green-600 min-h-[500px] p-6">
        {/* Pitch Lines */}
        <div className="absolute inset-4">
          {/* Outer border */}
          <div className="absolute inset-0 border-2 border-white rounded-lg"></div>

          {/* Center circle */}
          <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-24 h-24 border-2 border-white rounded-full"></div>
          <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full"></div>

          {/* Center line */}
          <div className="absolute left-0 top-1/2 w-full h-0.5 bg-white"></div>

          {/* Penalty areas */}
          <div className="absolute left-1/2 transform -translate-x-1/2 top-0 w-32 h-16 border-2 border-white border-t-0"></div>
          <div className="absolute left-1/2 transform -translate-x-1/2 bottom-0 w-32 h-16 border-2 border-white border-b-0"></div>

          {/* Goal areas */}
          <div className="absolute left-1/2 transform -translate-x-1/2 top-0 w-16 h-8 border-2 border-white border-t-0"></div>
          <div className="absolute left-1/2 transform -translate-x-1/2 bottom-0 w-16 h-8 border-2 border-white border-b-0"></div>
        </div>

        {/* Players Formation */}
        <div className="relative z-10 h-full flex flex-col justify-between py-12">

          {/* Attackers */}
          <div className="flex justify-center items-center mb-12" style={{ gap: attackerPlayers.length > 2 ? '8rem' : '16rem' }}>
            {attackerPlayers.map((player) => (
              <PlayerCard key={player.id} player={player} onPlayerClick={onPlayerClick} />
            ))}
          </div>

          {/* Midfielders */}
          <div className="flex justify-center items-center mb-12" style={{ gap: midfielderPlayers.length > 3 ? '8rem' : '16rem' }}>
            {midfielderPlayers.map((player) => (
              <PlayerCard key={player.id} player={player} onPlayerClick={onPlayerClick} />
            ))}
          </div>

          {/* Defenders */}
          <div className="flex justify-center items-center mb-12" style={{ gap: defenderPlayers.length > 3 ? '8rem' : '16rem' }}>
            {defenderPlayers.map((player) => (
              <PlayerCard key={player.id} player={player} onPlayerClick={onPlayerClick} />
            ))}
          </div>

          {/* Goalkeeper */}
          <div className="flex justify-center items-center">
            {goalkeeper && <PlayerCard key={goalkeeper.id} player={goalkeeper} onPlayerClick={onPlayerClick} />}
          </div>
        </div>
      </div>

      {/* Bench */}
      <div className="p-6 bg-gray-50 dark:bg-gray-800">
        <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Suplentes</h4>
        <div className="flex flex-wrap gap-3">
          {benchPlayers.map((player) => (
            <PlayerCard key={player.id} player={player} isStarter={false} onPlayerClick={onPlayerClick} />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="p-4 bg-gray-100 dark:bg-gray-900">
        <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span>Buena forma</span>
          </div>
          <div className="flex items-center gap-2">
            <Minus className="w-4 h-4 text-yellow-500" />
            <span>Forma regular</span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-500" />
            <span>Mala forma</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span>Lesionado/Duda</span>
          </div>
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-green-500" />
            <span>Disponible</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FootballPitch;

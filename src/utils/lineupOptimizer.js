// src/utils/lineupOptimizer.js

/**
 * Constants for player positions
 */
export const POSITIONS = {
  GOALKEEPER: 1,
  DEFENDER: 2,
  MIDFIELDER: 3,
  STRIKER: 4
};

/**
 * Valid formations as [Defenders, Midfielders, Strikers]
 */
export const VALID_FORMATIONS = [
  [3, 4, 3],
  [3, 5, 2],
  [4, 3, 3],
  [4, 4, 2],
  [4, 5, 1],
  [5, 3, 2],
  [5, 4, 1]
];

/**
 * Calculates a score for a player based on their stats and probability
 * @param {Object} player - The player object
 * @param {number} probability - Probability of playing (0-100)
 * @returns {number} Calculated score
 */
const calculatePlayerScore = (player, probability) => {
  // Base score is average points
  // Check direct property or nested in playerMaster
  const avgPoints = parseFloat(player.averagePoints || player.playerMaster?.averagePoints || 0);
  
  // Weight by probability
  // If probability is 100, we get full avgPoints
  // If probability is 0, we get 0
  const probFactor = probability / 100;
  
  return avgPoints * probFactor;
};

/**
 * Status priority mapping
 * available > questionable
 */
const STATUS_PRIORITY = {
  'ok': 2,
  'duda': 1,
  'injured': 0,
  'suspended': 0,
  'out': 0
};

/**
 * Get status priority score
 * @param {string} status 
 * @returns {number}
 */
const getStatusPriority = (status) => {
  // Map API status strings to priority
  // This might need adjustment based on actual API values
  if (!status) return 0;
  const s = status.toLowerCase();
  
  if (['ok', 'available'].includes(s)) return STATUS_PRIORITY.ok;
  if (['duda', 'questionable'].includes(s)) return STATUS_PRIORITY.duda;
  
  // Assume anything else is "bad" (injured, suspended, etc)
  return 0;
};

/**
 * Finds the optimal lineup for the given players and probabilities
 * @param {Array} allPlayers - List of all user's players
 * @param {Map<number, number>} probabilitiesMap - Map of playerMaster ID to probability (0-100)
 * @returns {Object} Optimal lineup and formation
 */
export const findOptimalLineup = (allPlayers, probabilitiesMap = new Map()) => {
  // 1. Filter out invalid players (injured, suspended)
  // We keep "duda" (questionable) but they will have lower priority via probability usually, 
  // or we can strictly punish them. The requirement says:
  // "players with available status are always preferred to players with questionable status"
  // "there should be no injured or suspended players"
  
  const validPlayers = allPlayers.filter(p => {
    const status = p.playerStatus || p.status || p.playerMaster?.playerStatus || p.playerMaster?.status;
    const priority = getStatusPriority(status); 
    return priority > 0;
  });

  // Group by position
  // positionId might be on wrapper or master
  const getPos = (p) => p.positionId || p.playerMaster?.positionId;

  const GKs = validPlayers.filter(p => getPos(p) === POSITIONS.GOALKEEPER);
  const DFs = validPlayers.filter(p => getPos(p) === POSITIONS.DEFENDER);
  const MFs = validPlayers.filter(p => getPos(p) === POSITIONS.MIDFIELDER);
  const STs = validPlayers.filter(p => getPos(p) === POSITIONS.STRIKER);

  // Helper to score and sort players
  const scoreAndSort = (players) => {
    return players.map(p => {
      // Default probability:
      // If found in map, use it.
      // IDs: try wrapper ID and master ID
      const id = p.id;
      const masterId = p.playerMaster?.id;
      
      let prob = probabilitiesMap.get(masterId) ?? probabilitiesMap.get(id);
      
      const status = p.playerStatus || p.status || p.playerMaster?.playerStatus || p.playerMaster?.status;

      if (prob === undefined) {
         // Fallback if no probability data
         const priority = getStatusPriority(status);
         prob = priority === STATUS_PRIORITY.ok ? 80 : 40; 
      }

      const score = calculatePlayerScore(p, prob);
      
      // Secondary sort: status priority (avail > questionable)
      // We add a large constant to score for available players to strictly prioritize them?
      // Requirement: "players with available status are always preferred to players with questionable status"
      // This sounds like a strict tier. Available players should ALWAYS be picked over questionable ones?
      // Or simply preferred? 
      // "always preferred" suggests a strict sort.
      
      const priority = getStatusPriority(status);
      const tierScore = priority * 1000; // Large number to separate tiers

      return { 
        player: p, 
        score, 
        totalMetric: tierScore + score,
        prob
      };
    }).sort((a, b) => b.totalMetric - a.totalMetric);
  };

  const scoredGKs = scoreAndSort(GKs);
  const scoredDFs = scoreAndSort(DFs);
  const scoredMFs = scoreAndSort(MFs);
  const scoredSTs = scoreAndSort(STs);

  let bestLineup = null;
  let maxTotalScore = -1;
  let bestFormation = null;

  // Iterate all valid formations
  VALID_FORMATIONS.forEach(formation => {
    const [numDF, numMF, numST] = formation;

    // Check if we have enough players for this formation
    if (scoredGKs.length < 1 || 
        scoredDFs.length < numDF || 
        scoredMFs.length < numMF || 
        scoredSTs.length < numST) {
      return;
    }

    // Pick top N players
    const selectedGK = scoredGKs[0]; // Always 1 GK
    const selectedDFs = scoredDFs.slice(0, numDF);
    const selectedMFs = scoredMFs.slice(0, numMF);
    const selectedSTs = scoredSTs.slice(0, numST);

    // Sum scores (using the calculated expected score, not the strict tier metric used for sorting)
    // Actually, we want to maximize "sum of average points" basically, 
    // but the inputs say: "maximize the sum of average points across players"
    // AND "probability... the better".
    // AND "available > questionable"
    
    // My sort strategy `tierScore + score` handles selection.
    // Now I calculate the "quality" of this lineup.
    // Should I sum the averagePoints? or the expected points?
    // "maximize the sum of average points"
    
    const sumPoints = 
      selectedGK.score + 
      selectedDFs.reduce((sum, item) => sum + item.score, 0) +
      selectedMFs.reduce((sum, item) => sum + item.score, 0) +
      selectedSTs.reduce((sum, item) => sum + item.score, 0);

      const currentLineup = {
        goalkeeper: selectedGK.player,
        defender: selectedDFs.map(i => i.player),
        midfield: selectedMFs.map(i => i.player),
        striker: selectedSTs.map(i => i.player)
      };

    if (sumPoints > maxTotalScore) {
      maxTotalScore = sumPoints;
      bestLineup = currentLineup;
      bestFormation = formation.join(','); // "3,4,3" string format for the component
    }
  });

  return { lineup: bestLineup, formation: bestFormation };
};

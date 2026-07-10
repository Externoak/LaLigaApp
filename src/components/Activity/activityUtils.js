import React from 'react';
import {
  Activity as ActivityIcon,
  ShoppingCart,
  Shield,
  TrendingUp,
  Calendar,
  Euro,
  Lock,
  UserPlus,
} from 'lucide-react';
import { extractArray } from '../../utils/helpers';

// Mapeos compartidos de tipos de actividad (activityTypeId del API):
// 1 compró · 4 blindó · 6 ganancia por jornada · 7 alineación incorrecta ·
// 9 nuevo miembro de la liga · 31 fichó · 32 clausuló · 33 vendió. Usados por
// la página Actividad y por el widget del Dashboard para que una misma
// actividad se pinte igual.

export const getActivityIcon = (activityType, isDynamicClause = false, className = 'w-5 h-5') => {
  if (isDynamicClause) return <Lock className={className} />;
  switch (activityType) {
    case 1:
    case 31:
      return <ShoppingCart className={className} />;
    case 4:
    case 32:
      return <Shield className={className} />;
    case 6:
      return <Euro className={className} />;
    case 7:
      return <Calendar className={className} />;
    case 9:
      return <UserPlus className={className} />;
    case 33:
      return <TrendingUp className={className} />;
    default:
      return <ActivityIcon className={className} />;
  }
};

export const getActivityColor = (activityType, isDynamicClause = false) => {
  if (isDynamicClause) {
    return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
  }
  switch (activityType) {
    case 1:
    case 31:
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    case 4:
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    case 6:
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
    case 7:
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
    case 9:
      return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400';
    case 32:
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 33:
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  }
};

// Compras, fichajes y cláusulas son gasto; ventas y ganancias son ingreso.
export const isExpenseActivity = (activityType, isDynamicClause = false) =>
  activityType === 1 || activityType === 31 || activityType === 32 || isDynamicClause;

// managerId -> { managerId, managerName, teamId } a partir de la clasificación
export const buildManagersCache = (rankingData) => {
  const map = new Map();
  extractArray(rankingData).forEach((d) => {
    if (d.team?.manager && d.team.id) {
      map.set(d.team.manager.id.toString(), {
        managerId: d.team.manager.id,
        managerName: d.team.manager.managerName,
        teamId: d.team.id,
      });
    }
  });
  return map;
};

// playerId -> player a partir de la lista completa de jugadores
export const buildPlayersCache = (playersData) => {
  const map = new Map();
  extractArray(playersData).forEach((p) => {
    if (p.id) map.set(p.id.toString(), p);
  });
  return map;
};

// Objeto de jugador embebido en un item de actividad, si lo hay. La API no
// siempre trae el jugador igual: puede venir como `playerMaster`/`player`
// (objeto), como `playerName` (string) o solo como id.
const getEmbeddedPlayer = (item) => {
  if (item.playerMaster && typeof item.playerMaster === 'object') return item.playerMaster;
  if (item.player && typeof item.player === 'object') return item.player;
  return null;
};

// Id del jugador referenciado por el item (string) o null si no hay ninguno.
export const getActivityPlayerId = (item) => {
  const id = item.playerMasterId ?? item.playerId ?? getEmbeddedPlayer(item)?.id ?? null;
  return id != null ? String(id) : null;
};

/**
 * Resuelve el jugador de un item de actividad probando, por orden: objeto
 * embebido → `playerName` → caché de ['allPlayers'] → nombres resueltos
 * bajo demanda (useActivityPlayerNames) → `player` como string.
 *
 * Devuelve { name, player } con name=null cuando el item no referencia a
 * ningún jugador reconocible (el llamador decide cómo pintarlo; nunca debe
 * mostrarse la palabra literal "jugador").
 */
export const resolveActivityPlayer = (item, playersCache, extraPlayers) => {
  const embedded = getEmbeddedPlayer(item);
  if (embedded?.nickname || embedded?.name) {
    return { name: embedded.nickname || embedded.name, player: embedded };
  }
  if (item.playerName) return { name: item.playerName, player: embedded };

  const id = getActivityPlayerId(item);
  if (id) {
    const cached = playersCache?.get(id);
    if (cached) return { name: cached.nickname || cached.name || null, player: cached };
    const extra = extraPlayers?.get(id);
    if (extra) return { name: extra.nickname || extra.name || null, player: extra };
  }

  if (typeof item.player === 'string' && item.player) return { name: item.player, player: null };
  return { name: null, player: embedded };
};

// Diagnóstico solo-dev: la 26/27 introduce activityTypeId nuevos; volcamos el
// item completo la primera vez que aparece cada tipo desconocido para poder
// mapear su verbo/campos sin adivinar.
const warnedUnknownActivityTypes = new Set();
export const logUnknownActivityType = (item) => {
  if (process.env.NODE_ENV === 'production') return;
  const t = item?.activityTypeId;
  if (warnedUnknownActivityTypes.has(t)) return;
  warnedUnknownActivityTypes.add(t);
  try {
    // eslint-disable-next-line no-console
    console.warn(`[activity] activityTypeId desconocido (${t}); item:`, JSON.stringify(item));
  } catch {
    // Nunca romper el feed por el diagnóstico.
  }
};

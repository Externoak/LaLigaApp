// Helpers compartidos para el estado de bloqueo de cláusulas de rescate.
// Semántica unificada: verde = clausulable ya, amarillo = se desbloquea en
// menos de 24h, rojo = bloqueada más tiempo.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Tiempo restante de bloqueo en formato corto ("2d 5h", "3h 12m", "45m").
 * `noTimeValue` controla qué devolver cuando no hay fecha de bloqueo: las
 * vistas de plantilla no pintan nada (null) y la de cláusulas 'Disponible'.
 */
export const getClauseTimeRemaining = (clauseEndTime, { noTimeValue = null } = {}) => {
    if (!clauseEndTime) return noTimeValue;
    const diffMs = new Date(clauseEndTime) - new Date();
    if (diffMs <= 0) return 'Disponible';

    const diffDays = Math.floor(diffMs / DAY_MS);
    const diffHours = Math.floor((diffMs % DAY_MS) / HOUR_MS);
    const diffMinutes = Math.floor((diffMs % HOUR_MS) / (60 * 1000));

    if (diffDays > 0) return `${diffDays}d ${diffHours}h`;
    if (diffHours > 0) return `${diffHours}h ${diffMinutes}m`;
    return `${diffMinutes}m`;
};

/** Clases del badge de estado según lo que quede de bloqueo. */
export const getClauseStatusColor = (clauseEndTime) => {
    if (!clauseEndTime) return 'bg-green-900 text-white';
    const diffMs = new Date(clauseEndTime) - new Date();
    if (diffMs <= 0) return 'bg-green-900 text-white';
    if (diffMs <= DAY_MS) return 'bg-yellow-800 text-white';
    return 'bg-red-900 text-white';
};

/** True si la cláusula se desbloquea dentro de las próximas 24h. */
export const isClauseExpiringSoon = (clauseEndTime) => {
    if (!clauseEndTime) return false;
    const diffHours = (new Date(clauseEndTime) - new Date()) / HOUR_MS;
    return diffHours > 0 && diffHours <= 24;
};

/**
 * Estado de bloqueo listo para pintar, unificado para todas las vistas.
 * `isOpen` cubre tanto "nunca estuvo bloqueada" como "el bloqueo ya expiró",
 * evitando pintar una cuenta atrás (o un "Disponible") cuando ya es clausulable.
 */
export const getClauseLockState = (clauseEndTime) => {
    const isOpen = !clauseEndTime || new Date(clauseEndTime) <= new Date();
    return {
        isOpen,
        expiringSoon: !isOpen && isClauseExpiringSoon(clauseEndTime),
        timeRemaining: isOpen ? null : getClauseTimeRemaining(clauseEndTime),
    };
};

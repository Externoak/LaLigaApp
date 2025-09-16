// Formatear moneda
export const formatCurrency = (amount) => {
    if (!amount) return '0€';

    // Format with thousands separators using dots
    return `${new Intl.NumberFormat('es-ES', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(Math.abs(amount))}€`;
};

// Formatear moneda con signo positivo/negativo
export const formatCurrencyWithSign = (amount) => {
    if (amount === null || amount === undefined) return '0€';

    const formattedAmount = new Intl.NumberFormat('es-ES', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(Math.abs(amount));

    if (amount > 0) return `+${formattedAmount}€`;
    if (amount < 0) return `-${formattedAmount}€`;
    return `${formattedAmount}€`;
};

// Formatear número con separadores
export const formatNumber = (num) => {
    if (!num) return '0';
    return new Intl.NumberFormat('es-ES').format(num);
};

// Calcular tiempo transcurrido
export const timeAgo = (date) => {
    if (!date) return '';

    const seconds = Math.floor((new Date() - new Date(date)) / 1000);

    const intervals = {
        año: 31536000,
        mes: 2592000,
        semana: 604800,
        día: 86400,
        hora: 3600,
        minuto: 60,
        segundo: 1
    };

    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            return `hace ${interval} ${unit}${interval > 1 ? 's' : ''}`;
        }
    }

    return 'ahora mismo';
};

// Import and re-export centralized player name normalization
export { normalizePlayerName } from './playerNameMatcher';

// Obtener emoji de posición
export const getPositionEmoji = (positionId) => {
    const emojis = {
        1: '🧤', // Portero
        2: '🛡️', // Defensa
        3: '⚡', // Centrocampista
        4: '⚽'  // Delantero
    };
    return emojis[positionId] || '👤';
};

// Obtener color de posición
export const getPositionColor = (positionId) => {
    const colors = {
        1: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
        2: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
        3: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        4: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
    };
    return colors[positionId] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
};

// Formatear fecha
export const formatDate = (date, format = 'short') => {
    if (!date) return '';

    const d = new Date(date);

    if (format === 'short') {
        return d.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    if (format === 'long') {
        return d.toLocaleDateString('es-ES', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }

    if (format === 'time') {
        return d.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    return d.toLocaleString('es-ES');
};

// Calcular porcentaje de cambio
export const calculatePercentageChange = (oldValue, newValue) => {
    if (!oldValue || oldValue === 0) return 0;
    return ((newValue - oldValue) / oldValue) * 100;
};

// Obtener estado del jugador
export const getPlayerStatus = (status) => {
    const statuses = {
        injured: {label: 'Lesionado', icon: '🤕', color: 'text-red-500'},
        suspended: {label: 'Sancionado', icon: '🔴', color: 'text-red-500'},
        doubt: {label: 'Duda', icon: '❓', color: 'text-yellow-500'},
        available: {label: 'Disponible', icon: '✅', color: 'text-green-500'}
    };

    return statuses[status] || statuses.available;
};

// Validar token JWT
export const isTokenValid = (token) => {
    if (!token) return false;

    try {
        const parts = token.split('.');
        if (parts.length !== 3) return false;

        const payload = JSON.parse(atob(parts[1]));
        const exp = payload.exp * 1000;

        return Date.now() < exp;
    } catch (error) {
        return false;
    }
};

// Extraer información del token
export const getTokenInfo = (token) => {
    if (!token) return null;

    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;

        const payload = JSON.parse(atob(parts[1]));

        return {
            email: payload.email,
            exp: new Date(payload.exp * 1000),
            iat: new Date(payload.iat * 1000)
        };
    } catch (error) {
        return null;
    }
};

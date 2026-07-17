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

// Formato compacto de moneda: 1.2M€ / 500K€ / 950€
export const formatCurrencyCompact = (value) => {
    const num = Number(value);
    if (!num || isNaN(num)) return '0€';
    if (Math.abs(num) >= 1000000) return `${(num / 1000000).toFixed(1)}M€`;
    if (Math.abs(num) >= 1000) return `${(num / 1000).toFixed(0)}K€`;
    return `${num}€`;
};

// Formatear número con punto como separador de miles (acepta number o string con dígitos)
export const formatNumberWithDots = (value) => {
    if (value === null || value === undefined || value === '') return '';
    const digits = value.toString().replace(/\D/g, '');
    if (!digits) return '';
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
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

// Obtener nombre de posición. El fallback se muestra de verdad (positionId 5
// = entrenador no está en el mapa), así que cada vista puede pasar el suyo.
export const getPositionName = (positionId, fallback = 'N/A') => {
    const names = {
        1: 'Portero',
        2: 'Defensa',
        3: 'Centrocampista',
        4: 'Delantero'
    };
    return names[positionId] || fallback;
};

// Obtener color de posición
export const getPositionColor = (positionId, fallback = 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400') => {
    const colors = {
        1: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
        2: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
        3: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        4: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
    };
    return colors[positionId] || fallback;
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

// Decodificar el payload de un JWT (sin verificar la firma)
export const parseJwtPayload = (token) => {
    if (!token) return null;

    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        return JSON.parse(atob(parts[1]));
    } catch (error) {
        return null;
    }
};

// Validar token JWT
export const isTokenValid = (token) => {
    const payload = parseJwtPayload(token);
    if (!payload) return false;
    return Date.now() < payload.exp * 1000;
};

// Extraer información del token
export const getTokenInfo = (token) => {
    const payload = parseJwtPayload(token);
    if (!payload) return null;

    return {
        email: payload.email,
        exp: new Date(payload.exp * 1000),
        iat: new Date(payload.iat * 1000)
    };
};

// Extrae el array de datos de una respuesta de la API, que puede venir como
// array directo, envuelto en .data/.elements, o bajo cualquier otra propiedad.
export const extractArray = (response) => {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.data)) return response.data;
    if (Array.isArray(response?.elements)) return response.elements;
    if (response && typeof response === 'object') {
        const arrayProperty = Object.values(response).find((val) => Array.isArray(val));
        if (arrayProperty) return arrayProperty;
    }
    return [];
};

// La API acepta como éxito cualquier 2xx, y varios endpoints (cláusulas,
// blindaje, ofertas, mercado) responden 200/204 con cuerpo vacío. ApiClient
// sólo lanza en respuestas !ok, así que aquí un cuerpo vacío NO significa fallo:
// gatear en response.data dejaba el modal colgado tras aplicar la acción.
export const isSuccessResponse = (response) => {
    if (!response) return false;
    const status = response.status;
    if (typeof status === 'number') return status >= 200 && status < 300;
    return response.data != null;
};

// Normaliza la respuesta de getTeamMoney, cuyo cuerpo puede venir como número,
// { teamMoney } o { money }. Devuelve un número si lo encuentra, o `undefined`
// = "no sabemos el saldo", distinto de `null` = "todavía cargando". Nunca
// devuelve 0 por un cuerpo vacío: sería mentira y bloquearía los formularios.
export const readTeamMoney = (response) => {
    const data = response?.data;
    const raw = typeof data === 'number' ? data : (data?.teamMoney ?? data?.money);
    if (raw == null) return undefined; // Number(null) sería 0: un null explícito NO es saldo 0
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
};

// Reemplaza el contenido del contenedor de un <img> roto por un badge de
// iniciales, construyendo nodos DOM (textContent) en lugar de innerHTML para
// que los nombres (datos scrapeados/de API) nunca se interpreten como marcado.
export const setImageFallback = (parentNode, options = {}) => {
    const {
        tag = 'div',
        className = '',
        style = '',
        text = '',
        textClassName = '',
        textStyle = '',
    } = options;

    if (!parentNode) return;

    const fallback = document.createElement(tag);
    if (className) fallback.className = className;
    if (style) fallback.style.cssText = style;

    if (textClassName || textStyle) {
        const span = document.createElement('span');
        if (textClassName) span.className = textClassName;
        if (textStyle) span.style.cssText = textStyle;
        span.textContent = text;
        fallback.appendChild(span);
    } else {
        fallback.textContent = text;
    }

    parentNode.replaceChildren(fallback);
};

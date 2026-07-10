const os = require('os');
const { startServer: startUnifiedServer } = require('../server');
const {
    WILDCARD_OR_LOOPBACK_HOSTS,
    DEFAULT_LOCAL_HOSTS,
    collectLanIPv4Addresses,
    normalizeHostForUrl,
    getUrlPriority,
} = require('./network-utils');

let unifiedServerInstance = null;
let serverAccessInfo = { host: null, port: null, urls: [] };

const parsePort = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const computeServerAccessUrls = (host, port) => {
    const hosts = new Set(DEFAULT_LOCAL_HOSTS);
    const boundToLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
    if (!boundToLoopback) {
        if (!host || WILDCARD_OR_LOOPBACK_HOSTS.has(host)) {
            collectLanIPv4Addresses().forEach((address) => hosts.add(address));
        } else {
            hosts.add(host);
        }
        // El nombre de máquina solo es alcanzable si escuchamos fuera de
        // loopback; anunciarlo con bind local llevaba a URLs muertas tipo
        // http://<hostname>:puerto.
        try {
            const osHostname = os.hostname();
            if (osHostname) {
                hosts.add(osHostname);
            }
        } catch {
            // Ignore hostname resolution errors
        }
    }
    const urls = [];
    hosts.forEach((item) => {
        const normalized = normalizeHostForUrl(item);
        if (!normalized) {
            return;
        }
        const base = normalized.startsWith('http://') || normalized.startsWith('https://') ? normalized : 'http://' + normalized;
        const suffix = port ? ':' + port : '';
        urls.push(base + suffix);
    });
    const unique = Array.from(new Set(urls));
    unique.sort((a, b) => getUrlPriority(a) - getUrlPriority(b));
    return unique;
};

const refreshServerAccessInfo = (host, port, activeAppOrigins) => {
    const urls = computeServerAccessUrls(host, port);
    serverAccessInfo = {
        host,
        port,
        urls,
    };
    if (activeAppOrigins) {
        urls.forEach((url) => {
            try {
                const origin = new URL(url).origin;
                activeAppOrigins.add(origin);
            } catch {
                // Ignore malformed URLs
            }
        });
    }
    return serverAccessInfo;
};

async function ensureUnifiedServer(activeAppOrigins) {
    if (unifiedServerInstance) {
        refreshServerAccessInfo(unifiedServerInstance.host, unifiedServerInstance.port, activeAppOrigins);
        return unifiedServerInstance;
    }

    // Accesible en la LAN por defecto: abrir la app desde el móvil es una
    // función anunciada. El allowlist de orígenes se limita abajo a las IPs
    // propias. Para restringir a esta máquina: ELECTRON_SERVER_HOST=127.0.0.1.
    const hostEnv = process.env.ELECTRON_SERVER_HOST || process.env.APP_HOST || process.env.HOST;
    const host = hostEnv && hostEnv.trim() ? hostEnv.trim() : '0.0.0.0';
    const envPort = parsePort(process.env.ELECTRON_SERVER_PORT || process.env.APP_PORT || process.env.PORT);

    const baseAppConfig = {
        host,
        serveStatic: true,
    };

    const allowedOriginsEnv = process.env.ELECTRON_ALLOWED_ORIGINS;
    const allowedOrigins = allowedOriginsEnv
        ? allowedOriginsEnv
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        : null;

    const allowedOriginSet = new Set(allowedOrigins && allowedOrigins.length ? allowedOrigins : []);

    const ensureOriginEntry = (origin) => {
        if (!origin) {
            return;
        }
        allowedOriginSet.add(origin);
    };

    ensureOriginEntry('app://.');
    ensureOriginEntry('http://localhost:*');
    ensureOriginEntry('http://127.0.0.1:*');

    const registerHostOrigins = (value) => {
        if (!value) {
            return;
        }
        if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('app://')) {
            ensureOriginEntry(value);
            return;
        }
        const sanitized = value.replace(/\/$/, '');
        if (!sanitized || WILDCARD_OR_LOOPBACK_HOSTS.has(sanitized)) {
            return;
        }
        const wrapped = sanitized.includes(':') && !sanitized.startsWith('[') ? '[' + sanitized + ']' : sanitized;
        ensureOriginEntry('http://' + wrapped + ':*');
    };

    if (WILDCARD_OR_LOOPBACK_HOSTS.has(host)) {
        collectLanIPv4Addresses().forEach(registerHostOrigins);
    } else {
        registerHostOrigins(host);
    }

    const portCandidates = [];
    if (envPort !== undefined) {
        portCandidates.push(envPort);
    } else {
        portCandidates.push(3005);
    }
    if (!portCandidates.includes(0)) {
        portCandidates.push(0);
    }

    let lastError;

    for (const candidate of portCandidates) {
        const overrides = {
            app: {
                ...baseAppConfig,
                port: candidate,
            },
        };

        if (allowedOriginSet.size > 0) {
            overrides.security = { allowedOrigins: Array.from(allowedOriginSet) };
        }

        try {
            unifiedServerInstance = await startUnifiedServer(overrides);

            const resolvedPort = unifiedServerInstance.port;
            process.env.ELECTRON_SERVER_PORT = String(resolvedPort);
            if (!process.env.APP_PORT) {
                process.env.APP_PORT = String(resolvedPort);
            }
            if (!process.env.PORT) {
                process.env.PORT = String(resolvedPort);
            }

            const resolvedHost = unifiedServerInstance.host;
            process.env.ELECTRON_SERVER_HOST = resolvedHost;
            if (!process.env.APP_HOST) {
                process.env.APP_HOST = resolvedHost;
            }

            refreshServerAccessInfo(resolvedHost, resolvedPort, activeAppOrigins);

            if (activeAppOrigins) {
                try {
                    activeAppOrigins.add(new URL(unifiedServerInstance.url).origin);
                } catch (error) {
                    console.warn('Failed to record unified server origin:', error.message);
                }
            }

            return unifiedServerInstance;
        } catch (error) {
            lastError = error;
            if (candidate === 0 || error?.code !== 'EADDRINUSE') {
                throw error;
            }
            console.warn(`Puerto ${candidate} está en uso, reintentando con un puerto dinámico.`);
            unifiedServerInstance = null;
            serverAccessInfo = { host: null, port: null, urls: [] };
        }
    }

    throw lastError || new Error('Error al iniciar el servidor unificado');
}

async function stopUnifiedServer() {
    if (unifiedServerInstance?.close) {
        try {
            await unifiedServerInstance.close();
        } catch (error) {
            console.error('Error al detener el servidor unificado:', error);
        }
    }
    unifiedServerInstance = null;
    serverAccessInfo = { host: null, port: null, urls: [] };
}

function getServerAccessInfo() {
    return serverAccessInfo;
}

function getUnifiedServerInstance() {
    return unifiedServerInstance;
}

module.exports = {
    ensureUnifiedServer,
    stopUnifiedServer,
    getServerAccessInfo,
    getUnifiedServerInstance,
};

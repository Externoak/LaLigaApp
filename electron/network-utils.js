const os = require('os');
const http = require('http');
const https = require('https');

// Bind addresses that don't identify a reachable LAN host: wildcard binds
// (listen on every interface) plus IPv6 loopback.
const WILDCARD_OR_LOOPBACK_HOSTS = new Set(['0.0.0.0', '::', '::ffff:0.0.0.0', '::1']);
const DEFAULT_LOCAL_HOSTS = ['localhost', '127.0.0.1'];

function isUrlReachable(url, timeout = 2000) {
    return new Promise((resolve) => {
        try {
            const parsed = new URL(url);
            const client = parsed.protocol === 'https:' ? https : http;
            const request = client.request({
                method: 'HEAD',
                hostname: parsed.hostname,
                port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
                path: parsed.pathname + parsed.search,
                timeout
            }, (response) => {
                response.resume();
                resolve(response.statusCode >= 200 && response.statusCode < 500);
            });

            request.on('timeout', () => {
                request.destroy();
                resolve(false);
            });

            request.on('error', () => resolve(false));
            request.end();
        } catch (error) {
            resolve(false);
        }
    });
}

// Duplicated on purpose in server/index.js: server/ stays dependency-free so
// the Docker backend can run without the electron/ tree.
const collectLanIPv4Addresses = () => {
    const addresses = new Set();
    const interfaces = os.networkInterfaces();
    Object.values(interfaces).forEach((entries) => {
        entries?.forEach((entry) => {
            if (!entry || entry.internal) {
                return;
            }
            const family = typeof entry.family === 'string' ? entry.family : String(entry.family);
            if (family !== 'IPv4' && family !== '4') {
                return;
            }
            addresses.add(entry.address);
        });
    });
    return Array.from(addresses);
};

const normalizeHostForUrl = (host) => {
    if (!host) {
        return null;
    }
    if (host.includes(':') && !host.startsWith('[') && !host.startsWith('http://') && !host.startsWith('https://')) {
        return '[' + host + ']';
    }
    return host;
};

const getUrlPriority = (url) => {
    try {
        const { hostname } = new URL(url);
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) && hostname !== '127.0.0.1') {
            return 0;
        }
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 2;
        }
        return 1;
    } catch {
        return 3;
    }
};

module.exports = {
    WILDCARD_OR_LOOPBACK_HOSTS,
    DEFAULT_LOCAL_HOSTS,
    isUrlReachable,
    collectLanIPv4Addresses,
    normalizeHostForUrl,
    getUrlPriority,
};

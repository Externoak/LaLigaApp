const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axiosPackagePath = require.resolve('axios/package.json');
const axios = require(path.join(path.dirname(axiosPackagePath), 'dist/node/axios.cjs'));
const { loadConfig } = require('./config');

// Ensure axios uses the Node http adapter even when XMLHttpRequest is present.
axios.defaults.adapter = 'http';

const isOriginAllowed = (origin, allowedOrigins) => {
  if (!origin) return false;
  return allowedOrigins.some((allowed) => {
    if (allowed === '*' || allowed === origin) return true;
    if (allowed.endsWith('*')) {
      return origin.startsWith(allowed.slice(0, -1));
    }
    if (allowed === 'app://.' && origin.startsWith('app://')) return true;
    return false;
  });
};

const buildCorsMiddleware = (config) => {
  const allowedOrigins = config.security.allowedOrigins;
  const allowNull = config.security.allowNullOrigin;
  const corsOptions = {
    origin: (origin, cb) => {
      if (!origin) {
        return allowNull ? cb(null, true) : cb(new Error('Origin header is required'));
      }
      if (isOriginAllowed(origin, allowedOrigins)) {
        return cb(null, true);
      }
      return cb(new Error(`Origin ${origin} is not allowed`));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'x-lang', 'x-app'],
    exposedHeaders: ['Content-Type'],
    maxAge: 86400,
  };

  const corsMiddleware = cors(corsOptions);

  return (req, res, next) => {
    corsMiddleware(req, res, (err) => {
      if (err) {
        res.status(403).json({ error: 'Origin not allowed', message: err.message });
        return;
      }
      next();
    });
  };
};

const buildRateLimiter = (config) =>
  rateLimit({
    windowMs: config.security.rateLimit.windowMs,
    max: config.security.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests' },
  });

const sanitizeProxyHeaders = (req, config) => {
  const headers = {};
  const forwardHeaders = new Set(
    config.proxy.forwardHeaders.filter(Boolean).map((header) => header.toLowerCase())
  );

  const coerceValue = (value) => {
    if (Array.isArray(value)) {
      return value
        .flatMap((item) => (item === undefined || item === null ? [] : [String(item)]))
        .join(', ');
    }
    if (value === undefined || value === null) {
      return undefined;
    }
    return String(value);
  };

  Object.entries(req.headers || {}).forEach(([key, rawValue]) => {
    const lowerKey = key.toLowerCase();
    if (!forwardHeaders.has(lowerKey)) {
      return;
    }

    const value = coerceValue(rawValue);
    if (value === undefined) {
      return;
    }

    if (lowerKey === 'authorization') {
      if (
        config.security.allowBearerOnly &&
        typeof value === 'string' &&
        !value.toLowerCase().startsWith('bearer ')
      ) {
        return;
      }
    }

    headers[lowerKey] = value;
  });

  Object.entries(config.proxy.defaultHeaders || {}).forEach(([key, rawValue]) => {
    const lowerKey = key.toLowerCase();
    if (headers[lowerKey]) {
      return;
    }
    const value = coerceValue(rawValue);
    if (value !== undefined) {
      headers[lowerKey] = value;
    }
  });

  return headers;
};

const createFantasyProxy = (config) => {
  const target = config.proxy.fantasyTarget;
  const contexts = [config.proxy.basePath, config.proxy.statsBasePath];

  const handleProxyReq = (proxyReq, req) => {
    const sanitized = sanitizeProxyHeaders(req, config);

    config.proxy.forwardHeaders.forEach((header) => {
      if (!header) return;
      const lower = header.toLowerCase();
      const value = sanitized[lower];
      const variants = new Set([
        header,
        lower,
        header.toUpperCase(),
        header
          .split('-')
          .map((segment) =>
            segment ? segment[0].toUpperCase() + segment.slice(1).toLowerCase() : segment
          )
          .join('-'),
      ]);

      variants.forEach((name) => {
        if (!name) return;
        try {
          proxyReq.removeHeader(name);
        } catch {
          // Header might not exist
        }
      });

      if (value !== undefined) {
        proxyReq.setHeader(header, value);
      }
    });

    try {
      const parsedUrl = new URL(req.originalUrl, 'http://internal-proxy.local');
      const lang = parsedUrl.searchParams.get('x-lang');
      if (lang) {
        proxyReq.setHeader('x-lang', lang);
      }
    } catch {
      // Ignore parsing issues, fallback header already applied
    }

    proxyReq.removeHeader('content-length');

    const method = (req.method || '').toUpperCase();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const body = req.body;
      const incomingHeaders = req.headers || {};
      const originalLengthHeader = incomingHeaders['content-length'];
      const parsedOriginalLength =
        typeof originalLengthHeader === 'string' ? Number.parseInt(originalLengthHeader, 10) : undefined;
      const hasTransferEncoding = Boolean(incomingHeaders['transfer-encoding']);
      const hasOriginalBody =
        hasTransferEncoding || (Number.isFinite(parsedOriginalLength) && parsedOriginalLength > 0);

      if (body !== undefined && body !== null) {
        let bodyBuffer;
        if (Buffer.isBuffer(body)) {
          bodyBuffer = body;
        } else if (typeof body === 'string') {
          if (body.length > 0 || hasOriginalBody) {
            bodyBuffer = Buffer.from(body);
          }
        } else if (typeof body === 'object') {
          const isArray = Array.isArray(body);
          const hasContent = isArray ? body.length > 0 : Object.keys(body).length > 0;
          if (hasContent || hasOriginalBody) {
            const originalContentType = incomingHeaders['content-type'];
            const proxyContentType = proxyReq.getHeader('content-type') || originalContentType;
            if (proxyContentType && proxyContentType.includes('application/x-www-form-urlencoded')) {
              bodyBuffer = Buffer.from(new URLSearchParams(body).toString());
            } else {
              if (!proxyContentType || proxyContentType.includes('application/json')) {
                proxyReq.setHeader('content-type', 'application/json');
              }
              bodyBuffer = Buffer.from(JSON.stringify(body));
            }
          }
        } else {
          const serialized = String(body);
          if (serialized.length > 0 || hasOriginalBody) {
            bodyBuffer = Buffer.from(serialized);
          }
        }

        if (bodyBuffer && bodyBuffer.length) {
          proxyReq.setHeader('content-length', bodyBuffer.length);
          proxyReq.write(bodyBuffer);
        }
      }
    }
  };

  const handleProxyRes = (proxyRes, req, res) => {
    const origin = req.headers.origin;
    if (origin) {
      proxyRes.headers['access-control-allow-origin'] = origin;
      proxyRes.headers['vary'] = 'Origin';
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    proxyRes.headers['access-control-allow-credentials'] = 'true';
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  };

  const handleError = (err, req, res) => {
    const status = err.code === 'ETIMEDOUT' ? 504 : 502;
    if (res && !res.headersSent) {
      res.status(status).json({ error: 'Proxy error', message: err.message });
    }
  };

  return createProxyMiddleware({
    pathFilter: contexts,
    target,
    changeOrigin: true,
    secure: true,
    logLevel: 'warn',
    ws: false,
    timeout: config.proxy.timeoutMs,
    proxyTimeout: config.proxy.timeoutMs,
    on: {
      proxyReq: handleProxyReq,
      proxyRes: handleProxyRes,
      error: handleError,
    },
  });
};

const buildMarketHandler = (config) => {
  const allowedHosts = new Set(config.proxy.marketAllowedHosts);
  const defaultUrl = config.proxy.marketDefaultUrl;

  const marketHeaders = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    DNT: '1',
    Pragma: 'no-cache',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };

  return async (req, res) => {
    const targetUrl = req.query.url || defaultUrl;

    if (!targetUrl) {
      res.status(400).json({ error: 'Missing parameters', message: 'url is required' });
      return;
    }

    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (error) {
      res.status(400).json({ error: 'Invalid URL', message: error.message });
      return;
    }

    if (!allowedHosts.has(parsed.hostname)) {
      res.status(403).json({ error: 'Host not allowed' });
      return;
    }

    try {
      const response = await axios.get(targetUrl, {
        headers: marketHeaders,
        timeout: config.proxy.timeoutMs,
        responseType: 'text',
        transformResponse: [(data) => data],
      });

      const origin = req.headers.origin;
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
      res.setHeader('Access-Control-Allow-Credentials', 'true');

      res.json({
        html: response.data,
        url: targetUrl,
        fetchedAt: new Date().toISOString(),
        success: true,
      });
    } catch (error) {
      const status = error.response?.status || 502;
      res.status(status).json({
        error: 'Market scrape failed',
        message: error.message,
        status,
      });
    }
  };
};
const buildGitHubProxyHandler = (config) => {
  const allowedHosts = new Set(['raw.githubusercontent.com', 'github.com']);
  const githubHeaders = {
    Accept: 'application/json',
    'User-Agent': 'LaLigaWeb-ChangelogViewer',
  };

  return async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
      res.status(400).json({ error: 'Missing parameters', message: 'url is required' });
      return;
    }

    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (error) {
      res.status(400).json({ error: 'Invalid URL', message: error.message });
      return;
    }

    if (!allowedHosts.has(parsed.hostname)) {
      res.status(403).json({ error: 'Host not allowed' });
      return;
    }

    try {
      const response = await axios.get(targetUrl, {
        headers: githubHeaders,
        timeout: config.proxy.timeoutMs,
        responseType: 'json',
      });

      const origin = req.headers.origin;
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
      res.setHeader('Access-Control-Allow-Credentials', 'true');

      res.json(response.data);
    } catch (error) {
      const status = error.response?.status || 502;
      res.status(status).json({
        error: 'GitHub fetch failed',
        message: error.message,
        status,
      });
    }
  };
};

const buildLineupHandler = (config) => {
  const allowedHosts = new Set(config.proxy.lineupAllowedHosts);
  const lineupHeaders = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    DNT: '1',
    Pragma: 'no-cache',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };

  return async (req, res) => {
    const targetUrl = req.query.url;
    const teamSlug = req.query.teamSlug;

    if (!targetUrl || !teamSlug) {
      res.status(400).json({ error: 'Missing parameters', message: 'url and teamSlug are required' });
      return;
    }

    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (error) {
      res.status(400).json({ error: 'Invalid URL', message: error.message });
      return;
    }

    if (!allowedHosts.has(parsed.hostname)) {
      res.status(403).json({ error: 'Host not allowed' });
      return;
    }

    try {
      const response = await axios.get(targetUrl, {
        headers: lineupHeaders,
        timeout: config.proxy.timeoutMs,
        responseType: 'text',
        transformResponse: [(data) => data],
      });

      const origin = req.headers.origin;
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
      res.setHeader('Access-Control-Allow-Credentials', 'true');

      res.json({
        html: response.data,
        teamSlug,
        url: targetUrl,
        fetchedAt: new Date().toISOString(),
        success: true,
      });
    } catch (error) {
      const status = error.response?.status || 502;
      res.status(status).json({
        error: 'Lineup scrape failed',
        message: error.message,
        status,
      });
    }
  };
};

const sharedSessionState = {
  tokens: null,
  user: null,
  updatedAt: null,
};

const buildApp = (config) => {
  const app = express();
  const corsMiddleware = buildCorsMiddleware(config);
  const limiter = buildRateLimiter(config);

  const fantasyProxy = createFantasyProxy(config);
  const lineupHandler = buildLineupHandler(config);
  const marketHandler = buildMarketHandler(config);
  const githubProxyHandler = buildGitHubProxyHandler(config);

  if (config.app.trustProxy) {
    app.set('trust proxy', config.app.trustProxy);
  }

  const skipHealthLogging = config.logging.silenceHealth;
  app.use(
    morgan(config.logging.format, {
      stream: {
        write: (message) => {
          if (process.env.NODE_ENV !== 'test') {
            console.log(message.trim());
          }
        },
      },
      skip: (req) => skipHealthLogging && req.path === '/health',
    })
  );

  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: false,
    })
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  app.use(corsMiddleware);

  app.options('*', (req, res) => {
    res.sendStatus(204);
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.post('/api/internal/session/share', (req, res) => {
    const { tokens, user } = req.body || {};

    if (!tokens || typeof tokens !== 'object') {
      res.status(400).json({ error: 'Invalid session payload' });
      return;
    }

    sharedSessionState.tokens = tokens;
    sharedSessionState.user = user || null;
    sharedSessionState.updatedAt = new Date().toISOString();

    res.json({ success: true, updatedAt: sharedSessionState.updatedAt });
  });

  app.get('/api/internal/session', (req, res) => {
    if (!sharedSessionState.tokens) {
      res.status(404).json({ error: 'No session available' });
      return;
    }

    res.json({
      tokens: sharedSessionState.tokens,
      user: sharedSessionState.user,
      updatedAt: sharedSessionState.updatedAt,
    });
  });

  app.delete('/api/internal/session/share', (req, res) => {
    sharedSessionState.tokens = null;
    sharedSessionState.user = null;
    sharedSessionState.updatedAt = new Date().toISOString();
    res.status(204).end();
  });

  app.use(config.proxy.basePath, limiter);
  app.use(config.proxy.statsBasePath, limiter);
  app.use(config.proxy.lineupPath, limiter);
  app.use(config.proxy.marketPath, limiter);
  app.use('/api/proxy-github', limiter);

  app.get(config.proxy.lineupPath, lineupHandler);
  app.get(config.proxy.marketPath, marketHandler);
  app.get('/api/proxy-github', githubProxyHandler);
  app.use(fantasyProxy);

  const resolvedStaticDir = config.app.staticDir;
  const hasBuild =
    config.app.serveStatic === true || (config.app.serveStatic !== false && fs.existsSync(resolvedStaticDir));

  if (hasBuild) {
    app.use(express.static(resolvedStaticDir, { index: false, maxAge: '1d' }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith(config.proxy.basePath) || req.path.startsWith(config.proxy.statsBasePath)) {
        next();
        return;
      }

      const indexPath = path.join(resolvedStaticDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        next();
      }
    });
  }

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found', path: req.originalUrl });
  });

  app.use((err, req, res, next) => {
    console.error('Unified server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
};

const normalizeLoopbackHost = (value) => {
  if (!value) {
    return '127.0.0.1';
  }
  const normalized = String(value).toLowerCase();
  if (normalized === '::' || normalized === '0.0.0.0' || normalized === '::ffff:0.0.0.0') {
    return '127.0.0.1';
  }
  if (normalized === '::1') {
    return '127.0.0.1';
  }
  return value;
};

const startServer = async (overrides = {}) => {
  const config = loadConfig(overrides);
  const app = buildApp(config);
  const server = http.createServer(app);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.app.port, config.app.host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const resolvedHost = typeof address === 'string' ? address : address.address;
  const resolvedPort = typeof address === 'string' ? config.app.port : address.port;

  const close = () =>
    new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

  const loopbackHost = normalizeLoopbackHost(resolvedHost);
  const baseHost = !loopbackHost ? '127.0.0.1' : loopbackHost;
  const formattedHost =
    baseHost.includes(':') && !baseHost.startsWith('[') ? `[${baseHost}]` : baseHost;
  const url = `http://${formattedHost}:${resolvedPort}`;

  return {
    app,
    server,
    config,
    host: resolvedHost,
    port: resolvedPort,
    url,
    close,
  };
};

if (require.main === module) {
  startServer()
    .then(({ url }) => {
      console.log(`Unified server listening at ${url}`);
    })
    .catch((error) => {
      console.error('Failed to start unified server:', error);
      process.exitCode = 1;
    });
}

module.exports = {
  buildApp,
  startServer,
};









const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const projectRoot = path.resolve(__dirname, '..');
const envFile = process.env.SERVER_ENV_FILE
  ? path.resolve(projectRoot, process.env.SERVER_ENV_FILE)
  : path.join(projectRoot, '.env');
const envFileExists = fs.existsSync(envFile);

if (envFileExists) {
  dotenv.config({ path: envFile });
} else {
  dotenv.config();
}

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toList = (value, fallback = []) => {
  if (!value) return [...fallback];
  if (Array.isArray(value)) return value.filter(Boolean).map((v) => v.trim());
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const toBool = (value, fallback) => {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).toLowerCase().trim();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
  return fallback;
};

const bundledAllowedOrigins = [
  'http://localhost:*',
  'http://127.0.0.1:*',
  'app://.'
];
const defaultAllowedOrigins = envFileExists
  ? bundledAllowedOrigins
  : ['*', ...bundledAllowedOrigins];

const derivedDefaultHost = process.env.APP_HOST || process.env.HOST || (envFileExists ? '127.0.0.1' : '0.0.0.0');

const defaultConfig = {
  env: process.env.NODE_ENV || 'development',
  app: {
    host: derivedDefaultHost,
    port: toInt(process.env.APP_PORT ?? process.env.PORT, 3005),
    basePath: process.env.APP_BASE_PATH || '/',
    staticDir: process.env.APP_STATIC_DIR
      ? path.resolve(projectRoot, process.env.APP_STATIC_DIR)
      : path.join(projectRoot, 'build'),
    serveStatic: toBool(process.env.APP_SERVE_STATIC, undefined),
    trustProxy: toBool(process.env.APP_TRUST_PROXY, false)
  },
  proxy: {
    basePath: process.env.PROXY_BASE_PATH || '/api',
    statsBasePath: process.env.PROXY_STATS_BASE_PATH || '/stats',
    fantasyTarget: process.env.PROXY_FANTASY_TARGET || 'https://api-fantasy.llt-services.com',
    lineupPath: process.env.PROXY_LINEUP_PATH || '/api/v4/scrape/lineup',
    lineupAllowedHosts: toList(process.env.PROXY_LINEUP_ALLOWED_HOSTS, ['www.futbolfantasy.com']),
    forwardHeaders: ['authorization', 'x-app', 'x-lang', 'content-type'],
    marketPath: process.env.PROXY_MARKET_PATH || '/api/v4/scrape/market',
    marketDefaultUrl: process.env.PROXY_MARKET_DEFAULT_URL || 'https://www.futbolfantasy.com/analytics/laliga-fantasy/mercado',
    marketAllowedHosts: toList(process.env.PROXY_MARKET_ALLOWED_HOSTS, ['www.futbolfantasy.com']),
    defaultHeaders: {
      'x-app': process.env.PROXY_DEFAULT_X_APP || '2',
      'x-lang': process.env.PROXY_DEFAULT_X_LANG || 'es',
      'user-agent': process.env.PROXY_DEFAULT_USER_AGENT ||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    timeoutMs: toInt(process.env.PROXY_TIMEOUT_MS, 15000)
  },
  security: {
    allowedOrigins: toList(process.env.APP_ALLOWED_ORIGINS, defaultAllowedOrigins),
    allowNullOrigin: toBool(process.env.APP_ALLOW_NULL_ORIGIN, true),
    rateLimit: {
      windowMs: toInt(process.env.PROXY_RATE_LIMIT_WINDOW_MS, 300_000),
      max: toInt(process.env.PROXY_RATE_LIMIT_MAX, 300)
    },
    allowBearerOnly: toBool(process.env.PROXY_ALLOW_BEARER_ONLY, true)
  },
  logging: {
    format: process.env.LOG_FORMAT || 'combined',
    level: process.env.LOG_LEVEL || 'info',
    silenceHealth: toBool(process.env.LOG_SILENCE_HEALTH, true)
  }
};

const deepMerge = (target, source) => {
  if (!source) return target;
  const output = Array.isArray(target) ? [...target] : { ...target };
  Object.keys(source).forEach((key) => {
    const sourceValue = source[key];
    if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
      output[key] = deepMerge((target && target[key]) || {}, sourceValue);
    } else {
      output[key] = sourceValue;
    }
  });
  return output;
};

const loadConfig = (overrides = {}) => {
  const baseClone = JSON.parse(JSON.stringify(defaultConfig));
  return deepMerge(baseClone, overrides);
};

module.exports = {
  loadConfig,
  defaultConfig,
  projectRoot
};

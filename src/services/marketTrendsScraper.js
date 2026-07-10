/**
 * Market trends — HTML scraper.
 *
 * Pulls the futbolfantasy.com market analytics page (via the dev/Electron
 * proxy or the bundled Electron `apiRequest` IPC) and parses the resulting
 * HTML into a Map keyed by `${normalizedName}|${position}|${normalizedTeam}`.
 * Cache + matching live in marketTrendsService.js; this module is the
 * stateless network + parser layer.
 */
import { normalizePlayerName, normalizeTeamName, extractMainSurname } from '../utils/playerNameMatcher';
import api from './api';

const MARKET_TRENDS_URL = 'https://www.futbolfantasy.com/analytics/laliga-fantasy/mercado';

const FALLBACK_TEAM_MAPPING = {
  "1": "Athletic",
  "2": "Atlético",
  "3": "Barcelona",
  "4": "Betis",
  "5": "Celta",
  "7": "Espanyol",
  "8": "Getafe",
  "10": "Levante",
  "12": "Mallorca",
  "13": "Osasuna",
  "14": "Rayo",
  "15": "Real Madrid",
  "16": "Real Sociedad",
  "17": "Sevilla",
  "18": "Valencia",
  "21": "Elche",
  "22": "Villarreal",
  "28": "Alavés",
  "30": "Girona",
  "43": "Real Oviedo"
};

const POSITION_NORMALIZATION = {
  'portero': 'portero',
  'defensa': 'defensa',
  'mediocampista': 'mediocampista',
  'centrocampista': 'mediocampista',
  'delantero': 'delantero'
};

const normalizePosition = (posicion) => {
  const normalized = (posicion || '').toLowerCase().trim();
  return POSITION_NORMALIZATION[normalized] || normalized;
};

const formatAmountShort = (amount) => {
  if (!amount || isNaN(amount)) return '0';
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
  return amount.toString();
};

const extractTeamMapping = (htmlText) => {
  try {
    const selectMatch = htmlText.match(/<select[^>]*name="equipo"[^>]*>([\s\S]*?)<\/select>/);
    if (!selectMatch) return { ...FALLBACK_TEAM_MAPPING };

    const selectContent = selectMatch[1];
    const optionMatches = selectContent.match(/<option[^>]*value="(\d+)"[^>]*>([^<]+)<\/option>/g);
    if (!optionMatches) return { ...FALLBACK_TEAM_MAPPING };

    let mapping = { ...FALLBACK_TEAM_MAPPING };
    optionMatches.forEach(option => {
      const match = option.match(/<option[^>]*value="(\d+)"[^>]*>([^<]+)<\/option>/);
      if (match) {
        const teamId = match[1];
        const teamName = match[2].trim();
        if (teamId !== '0') {
          mapping[teamId] = teamName;
        }
      }
    });
    return mapping;
  } catch (err) {
    console.warn('[marketTrendsScraper:extractTeamMapping]', err);
    return { ...FALLBACK_TEAM_MAPPING };
  }
};

/**
 * Parse HTML data to extract player market information.
 * Returns a Map keyed by `${normalizedName}|${position}|${normalizedTeam}`.
 */
export const parseMarketData = (htmlText) => {
  const newCache = new Map();

  try {
    const teamMapping = extractTeamMapping(htmlText);
    const playerElements = htmlText.split('class="elemento_jugador');

    for (let i = 1; i < playerElements.length; i++) {
      const elementText = playerElements[i];

      const nombreMatch = elementText.match(/data-nombre="([^"]+)"/);
      const posicionMatch = elementText.match(/data-posicion="([^"]+)"/);
      const valorMatch = elementText.match(/data-valor="(\d+)"/);
      const diferencia1Match = elementText.match(/data-diferencia1="([^"]+)"/);
      const diferenciaPct1Match = elementText.match(/data-diferencia-pct1="([^"]+)"/);
      const equipoMatch = elementText.match(/data-equipo="([^"]+)"/);

      if (!nombreMatch || !posicionMatch || !valorMatch || !diferencia1Match || !diferenciaPct1Match) {
        continue;
      }

      const nombre = nombreMatch[1];
      const posicion = posicionMatch[1];
      const valor = valorMatch[1];
      const diferencia1 = diferencia1Match[1];
      const diferenciaPct1 = diferenciaPct1Match[1];
      const equipoId = equipoMatch ? equipoMatch[1] : null;

      const valorNumerico = parseInt(valor, 10);
      const diferenciaNumerico = parseFloat(diferencia1);
      const porcentajeNumerico = parseFloat(diferenciaPct1);

      if (isNaN(valorNumerico) || isNaN(diferenciaNumerico) || isNaN(porcentajeNumerico)) {
        continue;
      }

      const teamName = equipoId && teamMapping[equipoId] ? teamMapping[equipoId] : 'LaLiga';

      const normalizedName = normalizePlayerName(nombre);
      const normalizedPositionStr = normalizePosition(posicion);
      const normalizedTeamNameStr = normalizeTeamName(teamName);
      const key = `${normalizedName}|${normalizedPositionStr}|${normalizedTeamNameStr}`;

      const playerData = {
        nombre: normalizedName,
        originalName: nombre,
        // Precalculado para el nivel-3 de findTrendCacheMatch (camino caliente)
        surname: extractMainSurname(normalizedName),
        posicion: normalizedPositionStr,
        equipo: normalizedTeamNameStr,
        originalTeamName: teamName,
        equipoId: equipoId,
        valor: valorNumerico,
        diferencia1: diferenciaNumerico,
        tendencia: diferenciaNumerico > 0 ? '📈' : diferenciaNumerico < 0 ? '📉' : '➡️',
        porcentaje: porcentajeNumerico,
        cambioTexto: diferenciaNumerico > 0 ? `+${formatAmountShort(Math.abs(diferenciaNumerico))}` :
          diferenciaNumerico < 0 ? `-${formatAmountShort(Math.abs(diferenciaNumerico))}` : '0',
        color: diferenciaNumerico > 0 ? '🟢' : diferenciaNumerico < 0 ? '🔴' : '⚪',
        isPositive: diferenciaNumerico > 0,
        isNegative: diferenciaNumerico < 0,
        lastUpdated: new Date().toISOString()
      };

      newCache.set(key, playerData);
    }
  } catch (err) {
    console.warn('[marketTrendsScraper:parseMarketData]', err);
  }

  return newCache;
};

/**
 * Fetch the raw HTML market trends page. Tries direct Electron `apiRequest`
 * when packaged, otherwise routes through the api.js proxy. Returns the
 * HTML string; throws on failure.
 */
export const fetchMarketHtml = async () => {
  const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;
  const isDev = process.env.NODE_ENV === 'development';

  const fetchViaProxy = async () => {
    const { data } = await api.get('/v4/scrape/market', {
      params: { url: MARKET_TRENDS_URL },
      timeout: 15000,
    });
    if (!data || !data.html) {
      throw new Error('Market scrape returned empty payload');
    }
    return data.html;
  };

  if (isElectron && !isDev) {
    try {
      const result = await window.electronAPI.apiRequest({
        url: MARKET_TRENDS_URL,
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:91.0) Gecko/20100101 Firefox/91.0'
        }
      });

      if (result.status !== 200 || !result.data) {
        throw new Error('HTTP error! status: ' + result.status);
      }

      return result.data;
    } catch (err) {
      console.warn('[marketTrendsScraper:electronFetch]', err);
      return fetchViaProxy();
    }
  }
  return fetchViaProxy();
};

export const MARKET_TRENDS_TARGET_URL = MARKET_TRENDS_URL;

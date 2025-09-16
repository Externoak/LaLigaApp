const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 3005;

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);

  
  // CORS headers - Allow any localhost port
  const origin = req.headers.origin;
  if (origin && origin.startsWith('http://localhost:')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-lang, x-app');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Handle favicon
  if (parsedUrl.pathname === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Handle health check
  if (parsedUrl.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', cors: 'configured' }));
    return;
  }

  // Handle scraping endpoint first
  if (parsedUrl.pathname === '/api/v4/scrape/lineup') {
    const targetUrl = parsedUrl.query.url;
    const teamSlug = parsedUrl.query.teamSlug;

    if (!targetUrl || !teamSlug) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Missing parameters',
        message: 'url and teamSlug are required'
      }));
      return;
    }

    
    // Use the existing futbolfantasy.com proxy logic
    try {
      const parsedTarget = url.parse(targetUrl);
      if (parsedTarget.hostname !== 'www.futbolfantasy.com') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Only futbolfantasy.com is allowed' }));
        return;
      }

      const targetHostname = parsedTarget.hostname;
      const targetPath = parsedTarget.path;
      const targetHeaders = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:91.0) Gecko/20100101 Firefox/91.0'
      };

      
      const proxyOptions = {
        hostname: targetHostname,
        path: targetPath,
        method: 'GET',
        headers: targetHeaders
      };

      const proxyReq = https.request(proxyOptions, (proxyRes) => {
        
        let data = '';
        let stream = proxyRes;

        // Handle compressed content
        if (proxyRes.headers['content-encoding']) {
          const zlib = require('zlib');

          if (proxyRes.headers['content-encoding'] === 'gzip') {
            stream = proxyRes.pipe(zlib.createGunzip());
          } else if (proxyRes.headers['content-encoding'] === 'deflate') {
            stream = proxyRes.pipe(zlib.createInflate());
          } else if (proxyRes.headers['content-encoding'] === 'br') {
            stream = proxyRes.pipe(zlib.createBrotliDecompress());
          }
        }

        stream.on('data', (chunk) => {
          data += chunk;
        });

        stream.on('end', () => {
          
          // Return the scraped data in the expected format with proper CORS headers
          const responseHeaders = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': req.headers.origin || 'http://localhost:3006',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-lang, x-app',
            'Access-Control-Allow-Credentials': 'true'
          };
          
          res.writeHead(200, responseHeaders);
          res.end(JSON.stringify({
            html: data,
            teamSlug: teamSlug,
            url: targetUrl,
            timestamp: new Date().toISOString(),
            success: true
          }));
        });

        stream.on('error', (error) => {
          console.error('❌ Stream error:', error.message);
          const errorHeaders = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': req.headers.origin || 'http://localhost:3006',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-lang, x-app',
            'Access-Control-Allow-Credentials': 'true'
          };
          res.writeHead(500, errorHeaders);
          res.end(JSON.stringify({
            error: 'Stream error',
            message: error.message,
            teamSlug: teamSlug,
            url: targetUrl
          }));
        });
      });

      proxyReq.on('error', (error) => {
        console.error('❌ Scraping error:', error.message);
        const errorHeaders = {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': req.headers.origin || 'http://localhost:3006',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-lang, x-app',
          'Access-Control-Allow-Credentials': 'true'
        };
        res.writeHead(500, errorHeaders);
        res.end(JSON.stringify({
          error: 'Scraping failed',
          message: error.message,
          teamSlug: teamSlug,
          url: targetUrl
        }));
      });

      proxyReq.end();
      return;

    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Invalid URL parameter',
        message: error.message
      }));
      return;
    }
  }

  // Handle different proxy routes
  let targetHostname, targetPath, targetHeaders;

  if (parsedUrl.pathname.startsWith('/api/') || parsedUrl.pathname.startsWith('/stats/')) {
    // Fantasy API requests
    targetHostname = 'api-fantasy.llt-services.com';
    targetPath = parsedUrl.pathname + (parsedUrl.search || '');
    targetHeaders = {
      'x-app': '2',
      'x-lang': parsedUrl.query['x-lang'] || 'es',
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
  } else if (parsedUrl.pathname.startsWith('/futbolfantasy')) {
    // Handle /futbolfantasy requests to futbolfantasy.com
    const targetUrl = parsedUrl.query.url;
    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing url parameter' }));
      return;
    }

    try {
      const parsedTarget = url.parse(targetUrl);
      if (parsedTarget.hostname !== 'www.futbolfantasy.com') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Only futbolfantasy.com is allowed' }));
        return;
      }

      targetHostname = parsedTarget.hostname;
      targetPath = parsedTarget.path;
      targetHeaders = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:91.0) Gecko/20100101 Firefox/91.0'
      };
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid URL parameter' }));
      return;
    }
  } else {
    // Route not found
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  
  // Make request to target API
  const options = {
    hostname: targetHostname,
    path: targetPath,
    method: req.method,
    headers: targetHeaders
  };

  // Forward Authorization header (Bearer token) if present
  if (req.headers.authorization) {
    options.headers['Authorization'] = req.headers.authorization;
      }

  const proxyReq = https.request(options, (proxyRes) => {
    
    // Handle different content types
    let contentType = 'application/json';
    if (targetHostname === 'www.futbolfantasy.com') {
      contentType = 'text/html';
    }

    // Set response headers (but not CORS headers from origin)
    res.writeHead(proxyRes.statusCode, {
      'Content-Type': proxyRes.headers['content-type'] || contentType,
      'Access-Control-Allow-Origin': origin || 'http://localhost:3000',
      'Access-Control-Allow-Credentials': 'true'
    });

    // Handle compressed content from futbolfantasy.com
    if (targetHostname === 'www.futbolfantasy.com' && proxyRes.headers['content-encoding']) {
      const zlib = require('zlib');
      let stream = proxyRes;

      if (proxyRes.headers['content-encoding'] === 'gzip') {
        stream = proxyRes.pipe(zlib.createGunzip());
      } else if (proxyRes.headers['content-encoding'] === 'deflate') {
        stream = proxyRes.pipe(zlib.createInflate());
      } else if (proxyRes.headers['content-encoding'] === 'br') {
        stream = proxyRes.pipe(zlib.createBrotliDecompress());
      }

      stream.pipe(res);
    } else {
      // Pipe the response directly
      proxyRes.pipe(res);
    }
  });

  proxyReq.on('error', (error) => {
    console.error('❌ Proxy error:', error.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', message: error.message }));
  });

  // Handle POST/PUT data
  if (req.method === 'POST' || req.method === 'PUT') {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
});

server.listen(PORT, () => {
                          });

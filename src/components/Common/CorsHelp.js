import React, { useState } from 'react';
import { useTransition, useSpring, animated } from '@react-spring/web';
import {
  HelpCircle,
  X,
  Copy,
  Check,
  ExternalLink,
  Terminal,
  Server,
  Chrome,
  Code
} from 'lucide-react';

const CorsHelp = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedText, setCopiedText] = useState('');

  const overlay = useTransition(isOpen, { from: { opacity: 0 }, enter: { opacity: 1 }, leave: { opacity: 0 } });
  const modalSpring = useSpring({ from: { opacity: 0, transform: 'scale(0.9)' }, to: { opacity: isOpen ? 1 : 0, transform: isOpen ? 'scale(1)' : 'scale(0.9)' } });

  const copyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(label);
      setTimeout(() => setCopiedText(''), 2000);
    } catch (error) {
      // swallow
    }
  };

  const solutions = [
    {
      id: 'proxy',
      title: '1. Proxy en desarrollo (Ya configurado)',
      icon: Server,
      status: 'active',
      description: 'El proyecto ya tiene configurado un proxy para desarrollo.',
      steps: [
        'El archivo setupProxy.js ya está configurado',
        'Las peticiones a /api se redirigen automáticamente',
        'Solo funciona con npm start (desarrollo)'
      ]
    },
    {
      id: 'extension',
      title: '2. Extensión CORS (Rápido)',
      icon: Chrome,
      status: 'recommended',
      description: 'Deshabilita CORS temporalmente en tu navegador.',
      steps: [
        'Instala una extensión como "CORS Unblock"',
        'Actívala solo para esta aplicación',
        '⚠️ No olvides desactivarla después'
      ],
      links: [
        {
          name: 'CORS Unblock (Chrome)',
          url: 'https://chrome.google.com/webstore/detail/cors-unblock/lfhmikememgdcahcdlaciloancbhjino'
        },
        {
          name: 'CORS Everywhere (Firefox)',
          url: 'https://addons.mozilla.org/en-US/firefox/addon/cors-everywhere/'
        }
      ]
    },
    {
      id: 'backend',
      title: '3. Backend propio (Producción)',
      icon: Code,
      status: 'production',
      description: 'Crea un backend que haga las peticiones por ti.',
      code: {
        'server.js': `const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// Proxy para La Liga Fantasy API
app.use('/api', async (req, res) => {
  try {
    const response = await axios({
      method: req.method,
      url: \`https://api-fantasy.llt-services.com/api\${req.path}\`,
      headers: {
        ...req.headers,
        host: 'api-fantasy.llt-services.com'
      },
      data: req.body
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500)
       .json({ error: error.message });
  }
});

app.listen(3001, () => {
  });`
      },
      steps: [
        'npm install express axios',
        'Crea proxy-server.js con el código de arriba',
        'node proxy-server.js',
        'Cambia API_BASE_URL a http://localhost:3001/api'
      ]
    },
    {
      id: 'chrome-flags',
      title: '4. Chrome con flags (Desarrollo)',
      icon: Terminal,
      status: 'development',
      description: 'Lanza Chrome deshabilitando CORS.',
      code: {
        'Windows': 'chrome.exe --user-data-dir="C:/temp/chrome_dev" --disable-web-security --disable-features=VizDisplayCompositor',
        'Mac': '/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --user-data-dir="/tmp/chrome_dev" --disable-web-security',
        'Linux': 'google-chrome --user-data-dir="/tmp/chrome_dev" --disable-web-security --disable-features=VizDisplayCompositor'
      },
      steps: [
        'Cierra todas las ventanas de Chrome',
        'Ejecuta el comando correspondiente a tu SO',
        '⚠️ Solo para desarrollo, no para uso normal'
      ]
    }
  ];

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100 dark:bg-green-900/20';
      case 'recommended': return 'text-blue-600 bg-blue-100 dark:bg-blue-900/20';
      case 'production': return 'text-purple-600 bg-purple-100 dark:bg-purple-900/20';
      case 'development': return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/20';
      default: return 'text-gray-600 bg-gray-100 dark:bg-gray-900/20';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'active': return 'Activo';
      case 'recommended': return 'Recomendado';
      case 'production': return 'Producción';
      case 'development': return 'Solo desarrollo';
      default: return '';
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 bg-primary-400 hover:bg-primary-500 text-white p-3 rounded-full shadow-lg transition-colors"
        title="Ayuda con CORS"
      >
        <HelpCircle className="w-6 h-6" />
      </button>

      {
        overlay((style, item) => item ? (
          <animated.div
            style={style}
            className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4"
            onClick={() => setIsOpen(false)}
          >
            <animated.div
              style={modalSpring}
              className="bg-white dark:bg-dark-card rounded-lg shadow-xl max-w-4xl max-h-[90vh] overflow-hidden w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-200 dark:border-dark-border">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Soluciones para errores CORS
                  </h2>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <p className="text-gray-600 dark:text-gray-300 mt-2">
                  Varias opciones para que las peticiones API funcionen sin errores CORS
                </p>
              </div>

              <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
                <div className="space-y-6">
                  {solutions.map((solution) => (
                    <div key={solution.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <solution.icon className="w-6 h-6 text-primary-500" />
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {solution.title}
                          </h3>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(solution.status)}`}>
                          {getStatusText(solution.status)}
                        </span>
                      </div>

                      <p className="text-gray-600 dark:text-gray-300 mb-4">
                        {solution.description}
                      </p>

                      <div className="space-y-3">
                        {solution.steps && (
                          <div>
                            <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                              Pasos:
                            </h4>
                            <ol className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
                              {solution.steps.map((step, index) => (
                                <li key={index} className="flex items-start">
                                  <span className="mr-2 text-primary-500 font-medium">
                                    {index + 1}.
                                  </span>
                                  <span>{step}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}

                        {solution.code && (
                          <div>
                            <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                              Código:
                            </h4>
                            {typeof solution.code === 'string' ? (
                              <div className="relative">
                                <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg text-sm overflow-x-auto">
                                  <code>{solution.code}</code>
                                </pre>
                                <button
                                  onClick={() => copyToClipboard(solution.code, solution.id)}
                                  className="absolute top-2 right-2 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                                >
                                  {copiedText === solution.id ? (
                                    <Check className="w-4 h-4 text-green-500" />
                                  ) : (
                                    <Copy className="w-4 h-4" />
                                  )}
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {Object.entries(solution.code).map(([key, value]) => (
                                  <div key={key}>
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        {key}:
                                      </span>
                                      <button
                                        onClick={() => copyToClipboard(value, `${solution.id}-${key}`)}
                                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-xs"
                                      >
                                        {copiedText === `${solution.id}-${key}` ? (
                                          <Check className="w-3 h-3 text-green-500" />
                                        ) : (
                                          <Copy className="w-3 h-3" />
                                        )}
                                      </button>
                                    </div>
                                    <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg text-xs overflow-x-auto">
                                      <code>{value}</code>
                                    </pre>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {solution.links && (
                          <div>
                            <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                              Enlaces útiles:
                            </h4>
                            <div className="space-y-2">
                              {solution.links.map((link, index) => (
                                <a
                                  key={index}
                                  href={link.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                  {link.name}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </animated.div>
          </animated.div>
        ) : null)
      }
    </>
  );
};

export default CorsHelp;



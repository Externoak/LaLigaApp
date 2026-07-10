// Validación de origen para el middleware CORS del servidor unificado.
// Módulo puro (sin dependencias) para poder testearlo desde la suite de CRA.

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

module.exports = { isOriginAllowed };

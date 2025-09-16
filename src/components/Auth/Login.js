import React, { useState } from 'react';
import { motion, AnimatePresence } from '../../utils/motionShim';
import { LogIn, Mail, Lock, ExternalLink, Chrome } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import authService from '../../services/authService';
import updateService from '../../services/updateService';

// Enhanced Modal Component for Token Input with Validation
const TokenModal = ({ isOpen, onClose, onSubmit, value, onChange }) => {
  if (!isOpen) return null;

  // Validate JSON format and required keys
  const validateToken = () => {
    if (!value.trim()) {
      return { isValid: false, error: 'El token no puede estar vacío' };
    }

    try {
      const parsed = JSON.parse(value.trim());

      // Check if it has either access_token or id_token
      if (!parsed.access_token && !parsed.id_token) {
        return {
          isValid: false,
          error: 'El JSON debe contener al menos "access_token" o "id_token"'
        };
      }

      // Additional validation for token_type if access_token exists
      if (parsed.access_token && !parsed.token_type) {
        return {
          isValid: false,
          error: 'El JSON debe contener "token_type" cuando tiene "access_token"'
        };
      }

      // Check for refresh_token - essential for maintaining sessions
      if (!parsed.refresh_token) {
        return {
          isValid: false,
          error: 'El JSON debe contener "refresh_token" para mantener la sesión activa'
        };
      }

      return { isValid: true, error: null };
    } catch (error) {
      return {
        isValid: false,
        error: 'Formato JSON inválido. Asegúrate de copiar el JSON completo desde { hasta }'
      };
    }
  };

  const validation = validateToken();

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl w-full max-w-2xl border border-white/20"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
        >
          <div className="p-8">
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-gradient-to-r from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center mr-4">
                <Chrome className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">Pegar Token JSON</h3>
                <p className="text-gray-500 text-sm">Introduce el token completo obtenido desde las herramientas de desarrollador</p>
              </div>
            </div>

            <div className="mb-4">
              <div className="relative">
                <textarea
                  value={value}
                  onChange={onChange}
                  className={`w-full h-48 p-4 bg-gray-50/50 border rounded-2xl focus:outline-none focus:ring-2 focus:bg-white transition-all duration-300 font-mono text-sm resize-none ${
                    validation.isValid 
                      ? 'border-gray-200 focus:ring-primary-400 focus:border-primary-400' 
                      : 'border-red-300 focus:ring-red-400 focus:border-red-400'
                  }`}
                  placeholder='Pega aquí el JSON completo, por ejemplo:\n{\n  "access_token": "...",\n  "token_type": "Bearer",\n  "expires_in": 3600,\n  ...\n}'
                />
                <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r transition-all duration-300 pointer-events-none ${
                  validation.isValid 
                    ? 'from-primary-400/0 via-primary-400/0 to-primary-400/0 focus-within:from-primary-400/5 focus-within:via-primary-400/5 focus-within:to-primary-400/5'
                    : 'from-red-400/0 via-red-400/0 to-red-400/0 focus-within:from-red-400/5 focus-within:via-red-400/5 focus-within:to-red-400/5'
                }`}></div>
              </div>
            </div>

            {/* Validation Messages */}
            <AnimatePresence>
              {!validation.isValid && value.trim() && (
                <motion.div
                  className="mb-4 p-3 bg-gradient-to-r from-red-50 to-rose-50 border border-red-200/50 rounded-xl"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-center">
                    <div className="w-5 h-5 bg-red-500 rounded-full mr-3 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">!</span>
                    </div>
                    <p className="text-red-700 text-sm font-medium">{validation.error}</p>
                  </div>
                </motion.div>
              )}

              {validation.isValid && value.trim() && (
                <motion.div
                  className="mb-4 p-3 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200/50 rounded-xl"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-center">
                    <div className="w-5 h-5 bg-green-500 rounded-full mr-3 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">✓</span>
                    </div>
                    <p className="text-green-700 text-sm font-medium">JSON válido y contiene los tokens requeridos</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex justify-end space-x-4">
              <motion.button
                onClick={onClose}
                className="px-6 py-3 text-gray-600 hover:text-gray-800 font-medium rounded-2xl hover:bg-gray-100 transition-all duration-200"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Cancelar
              </motion.button>
              <motion.button
                onClick={validation.isValid ? onSubmit : null}
                disabled={!validation.isValid}
                className={`px-8 py-3 font-bold rounded-2xl shadow-lg transition-all duration-300 ${
                  validation.isValid
                    ? 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white hover:shadow-xl cursor-pointer'
                    : 'bg-gradient-to-r from-gray-300 to-gray-400 text-gray-500 cursor-not-allowed'
                }`}
                whileHover={{ scale: validation.isValid ? 1.02 : 1 }}
                whileTap={{ scale: validation.isValid ? 0.98 : 1 }}
              >
                Iniciar Sesión
              </motion.button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};


const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loginMethod, setLoginMethod] = useState('email'); // 'email' or 'token'

  // New state for the modal
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [tokenInputValue, setTokenInputValue] = useState('');

  // Load saved credentials on component mount
  React.useEffect(() => {
    const savedCredentials = localStorage.getItem('laliga_saved_credentials');
    if (savedCredentials) {
      try {
        const parsed = JSON.parse(savedCredentials);
        setEmail(parsed.email || '');
        setPassword(parsed.password || '');
        setRememberMe(true);
      } catch (error) {
      }
    }
  }, []);

  const { login } = useAuthStore();

  const handleEmailLogin = async () => {
    if (!email || !password) {
      setError('Ingresa tu email y contraseña');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const tokenResponse = await authService.getToken(email, password);

      // Save or clear credentials based on rememberMe checkbox
      if (rememberMe) {
        localStorage.setItem('laliga_saved_credentials', JSON.stringify({
          email: email,
          password: password
        }));
      } else {
        localStorage.removeItem('laliga_saved_credentials');
      }

      // Pass the complete token response to login, not just the access_token
      await login(tokenResponse);

    } catch (error) {
      setError(error.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    setLoading(true);
    setError(null);

    // Abrir La Liga en una nueva pestaña
    window.open('https://miliga.laliga.com/', '_blank');
    setError('Ve a la pestaña de La Liga, inicia sesión, luego copia el token aquí abajo');
    setLoading(false);
  };

  // Modified function: Now just opens the modal
  const handleTokenLogin = () => {
    setIsTokenModalOpen(true);
  };

  // New function: Contains the logic to process the token from the modal
  const handleSubmitToken = async () => {
    if (!tokenInputValue) {
      setError('El token no puede estar vacío.');
      return;
    }

    setIsTokenModalOpen(false); // Close the modal
    setLoading(true);
    setError(null);

    try {
      let tokenData = tokenInputValue.trim();

      if (tokenData.startsWith('{')) {
        const parsed = JSON.parse(tokenData);
        if (parsed.access_token || parsed.id_token) {
          // Pass the complete OAuth response to preserve refresh_token
          await login(parsed);
        } else {
          throw new Error('No se encontró access_token o id_token en el JSON');
        }
      } else {
        if (tokenData.startsWith('Bearer ')) {
          tokenData = tokenData.substring(7);
        }
        await login(tokenData);
      }
    } catch (error) {
      setError(`Token inválido: ${error.message || 'Formato incorrecto'}`);
    } finally {
      setLoading(false);
      setTokenInputValue(''); // Clear the input field
    }
  };


  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && loginMethod === 'email') {
      handleEmailLogin();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-400 via-primary-500 to-primary-600 flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-30" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
      }}></div>

      {/* Floating shapes */}
      <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-white/5 rounded-full blur-xl animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-24 h-24 bg-white/5 rounded-full blur-xl animate-pulse" style={{animationDelay: '2s'}}></div>
      <div className="absolute top-1/2 left-1/6 w-16 h-16 bg-white/5 rounded-full blur-xl animate-pulse" style={{animationDelay: '4s'}}></div>

      <motion.div
        className="w-full max-w-2xl relative z-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/20 p-8 relative overflow-hidden">
          {/* Card glow effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary-50/50 to-transparent pointer-events-none"></div>
          <div className="text-center mb-8 relative">
            {/* Logo */}
            <div className="w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <img
                src="./fantasy_emblem.png"
                alt="LaLiga Fantasy"
                className="w-20 h-20 object-contain"
                onError={(e) => {
                  // Fallback to previous design if image fails to load
                  e.target.style.display = 'none';
                  e.target.nextElementSibling.style.display = 'flex';
                }}
              />
              <div className="w-16 h-16 bg-gradient-to-br from-primary-400 to-primary-600 rounded-2xl flex items-center justify-center shadow-lg" style={{ display: 'none' }}>
                <span className="text-2xl font-bold text-white">⚽</span>
              </div>
            </div>
            <motion.h1
              className="text-3xl font-bold bg-gradient-to-r from-primary-600 to-primary-700 bg-clip-text text-transparent mb-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              La Liga Fantasy
            </motion.h1>
            <motion.p
              className="text-gray-600"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              Accede a tu cuenta para gestionar tu equipo
            </motion.p>
          </div>

          {/* Selector de método */}
          <motion.div
            className="flex rounded-2xl bg-gradient-to-r from-gray-100 to-gray-50 p-1.5 mb-8 shadow-inner"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
          >
            <button
              onClick={() => setLoginMethod('email')}
              className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-300 ${
                loginMethod === 'email'
                  ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg transform scale-105'
                  : 'text-gray-600 hover:text-primary-600 hover:bg-white/50'
              }`}
            >
              <Mail className="w-4 h-4 inline mr-2" />
              Email/Contraseña
            </button>
            <button
              onClick={() => setLoginMethod('token')}
              className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-300 ${
                loginMethod === 'token'
                  ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg transform scale-105'
                  : 'text-gray-600 hover:text-primary-600 hover:bg-white/50'
              }`}
            >
              <Chrome className="w-4 h-4 inline mr-2" />
              Token/Google
            </button>
          </motion.div>

          <AnimatePresence mode="wait">
          {loginMethod === 'email' ? (
            <motion.form
              className="space-y-6"
              key="email-form"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <div>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-primary-500 w-5 h-5 transition-colors" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="w-full pl-12 pr-4 py-4 bg-gray-50/50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 focus:bg-white transition-all duration-300 text-gray-700 placeholder-gray-400"
                    placeholder="Introduce tu email"
                    disabled={loading}
                  />
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary-400/0 via-primary-400/0 to-primary-400/0 group-focus-within:from-primary-400/5 group-focus-within:via-primary-400/5 group-focus-within:to-primary-400/5 transition-all duration-300 pointer-events-none"></div>
                </div>
              </div>

              <div>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-primary-500 w-5 h-5 transition-colors" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="w-full pl-12 pr-4 py-4 bg-gray-50/50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 focus:bg-white transition-all duration-300 text-gray-700 placeholder-gray-400"
                    placeholder="Introduce tu contraseña"
                    disabled={loading}
                  />
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary-400/0 via-primary-400/0 to-primary-400/0 group-focus-within:from-primary-400/5 group-focus-within:via-primary-400/5 group-focus-within:to-primary-400/5 transition-all duration-300 pointer-events-none"></div>
                </div>
              </div>

              <div className="flex items-center group">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-5 h-5 text-primary-500 bg-white border-2 border-gray-300 rounded-lg focus:ring-primary-400 focus:ring-2 transition-all duration-200"
                  disabled={loading}
                />
                <label htmlFor="remember-me" className="ml-3 text-sm text-gray-600 font-medium cursor-pointer group-hover:text-primary-600 transition-colors">
                  Recordar mis credenciales
                </label>
              </div>

              <motion.button
                type="button"
                onClick={handleEmailLogin}
                disabled={loading || !email || !password}
                className="w-full bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 disabled:from-gray-300 disabled:to-gray-400 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center space-x-3 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none disabled:shadow-none"
                whileTap={{ scale: 0.98 }}
                whileHover={{ scale: loading ? 1 : 1.02 }}
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    <span>Iniciando sesión...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    <span>Iniciar Sesión</span>
                  </>
                )}
              </motion.button>
            </motion.form>
          ) : (
            <motion.div
              className="space-y-6"
              key="token-form"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              {/* Step-by-step guide */}
              <motion.div
                className="bg-gradient-to-br from-blue-50/80 via-indigo-50/80 to-purple-50/80 backdrop-blur-sm border border-blue-200/60 rounded-3xl p-8 mb-6 shadow-lg hover:shadow-xl transition-all duration-300"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <div className="flex items-center mb-6">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center mr-4 shadow-lg">
                    <span className="text-white text-xl">📋</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-blue-900 text-xl mb-1">Guía paso a paso</h3>
                    <p className="text-blue-600 text-sm">Sigue estos pasos para obtener tu token de acceso, solo deberías tener que hacer esto
                        <span className="font-medium bg-blue-100 px-2 py-0.5 rounded">una única vez</span>.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Step 1 */}
                  <div className="flex gap-4 p-4 bg-white/60 rounded-xl border border-blue-100/50">
                    <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm">
                      1
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-blue-900 mb-2 flex items-center text-base">
                        <span className="mr-2">🌐</span>
                        Ve a la página de Login de La Liga
                      </h4>
                      <div className="text-blue-700 text-sm space-y-1">
                        <p>• Haz clic en el botón azul <span className="font-medium bg-blue-100 px-2 py-0.5 rounded">"Abrir La Liga"</span> que está más abajo</p>
                        <p>• Se abrirá una nueva pestaña con la página de inicio de sesión de La Liga</p>
                        <p className="flex items-center">
                          <span className="w-2 h-2 bg-amber-400 rounded-full mr-2 animate-pulse"></span>
                          <span className="font-medium text-amber-700">MUY IMPORTANTE:</span> NO hagas login todavía, solo ve a la página
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="flex gap-4 p-4 bg-white/60 rounded-xl border border-blue-100/50">
                    <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-r from-indigo-400 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm">
                      2
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-blue-900 mb-2 flex items-center text-base">
                        <span className="mr-2">🔧</span>
                        Abre las Herramientas de Desarrollador
                      </h4>
                      <div className="text-blue-700 text-sm space-y-1">
                        <p>• Estando en la página de La Liga, pulsa la tecla <kbd className="bg-gray-200 px-2 py-0.5 rounded text-sm font-mono font-bold">F12</kbd></p>
                        <p>• Si F12 no funciona, prueba <kbd className="bg-gray-200 px-2 py-0.5 rounded text-sm font-mono">Ctrl</kbd> + <kbd className="bg-gray-200 px-2 py-0.5 rounded text-sm font-mono">Shift</kbd> + <kbd className="bg-gray-200 px-2 py-0.5 rounded text-sm font-mono">I</kbd></p>
                        <p>• Se abrirá un panel en la parte inferior o lateral de la pantalla</p>
                        <p>• Busca y haz clic en la pestaña que dice <span className="font-medium bg-blue-100 px-2 py-0.5 rounded">"Network"</span> o <span className="font-medium bg-blue-100 px-2 py-0.5 rounded">"Red"</span></p>
                        <p>• Asegurate el la cajita <span className="font-medium bg-blue-100 px-2 py-0.5 rounded">"preserve log"</span> tenga ✔️</p>
                        <p>• Dentro de esa pestaña, busca un botón que diga <span className="font-medium bg-blue-100 px-2 py-0.5 rounded">"Fetch/XHR"</span> y haz clic en él</p>
                      </div>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="flex gap-4 p-4 bg-white/60 rounded-xl border border-blue-100/50">
                    <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-r from-purple-400 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm">
                      3
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-blue-900 mb-2 flex items-center text-base">
                        <span className="mr-2">🔐</span>
                        Ahora sí, inicia sesión
                      </h4>
                      <div className="text-blue-700 text-sm space-y-1">
                        <p>• Con las herramientas de desarrollador abiertas, introduce tu email y contraseña en La Liga</p>
                        <p>• Haz clic en el botón de iniciar sesión</p>
                        <p>• Verás que empiezan a aparecer muchas líneas en el panel de herramientas (esto es normal)</p>
                        <p>• Espera a que termine de cargar completamente</p>
                      </div>
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div className="flex gap-4 p-4 bg-white/60 rounded-xl border border-blue-100/50">
                    <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm">
                      4
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-blue-900 mb-2 flex items-center text-base">
                        <span className="mr-2">📋</span>
                        Encuentra y copia el token
                      </h4>
                      <div className="text-blue-700 text-sm space-y-2">
                        <div>
                          <p className="font-medium">🔍 Filtrar las respuestas:</p>
                          <p>• En el panel Network, busca una caja de texto (suele tener un icono de lupa 🔍)</p>
                          <p>• Copia y pega exactamente este texto en esa caja:</p>
                        </div>
                        <div className="bg-gray-900 rounded-lg p-2 my-2">
                          <p className="text-green-400 font-mono text-sm break-all">token?p=B2C_1A_5ULAIP_PARAMETRIZED_SIGNIN</p>
                        </div>
                        <div>
                          <p className="font-medium">📍 Encontrar el resultado:</p>
                          <p>• Debería aparecer una sola línea que empiece por <code className="bg-gray-200 px-1.5 py-0.5 rounded text-sm">login.laliga.es</code></p>
                          <p>• Haz clic sobre esa línea (sobre la parte que dice la URL)</p>
                        </div>
                        <div>
                          <p className="font-medium">👀 Ver la respuesta:</p>
                          <p>• A la derecha se abrirá más información</p>
                          <p>• Busca una pestaña que diga <span className="bg-blue-100 px-2 py-0.5 rounded font-medium">"Response"</span> o <span className="bg-blue-100 px-2 py-0.5 rounded font-medium">"Respuesta"</span></p>
                          <p>• Si no la ves, puede estar oculta bajo el símbolo <strong>&gt;&gt;</strong></p>
                        </div>
                        <div>
                          <p className="font-medium">📋 Copiar todo el contenido:</p>
                          <p>• Verás un texto que empieza por <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">{"{"}</code> y termina por <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">{"}"}</code></p>
                          <p>• Selecciona TODO ese texto (desde la primera llave hasta la última) y cópialo</p>
                          <p>• Luego usa el botón verde <span className="bg-green-100 px-2 py-0.5 rounded font-medium">"Pegar Token"</span> de abajo</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              <motion.button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-300 disabled:to-gray-400 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center space-x-3 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none mb-4"
                whileTap={{ scale: 0.98 }}
                whileHover={{ scale: loading ? 1 : 1.02 }}
              >
                <ExternalLink className="w-5 h-5" />
                <span>Abrir La Liga</span>
              </motion.button>

              <motion.button
                onClick={handleTokenLogin}
                disabled={loading}
                className="w-full bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 disabled:from-gray-300 disabled:to-gray-400 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center space-x-3 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none"
                whileTap={{ scale: 0.98 }}
                whileHover={{ scale: loading ? 1 : 1.02 }}
              >
                <Chrome className="w-5 h-5" />
                <span>Pegar Token</span>
              </motion.button>
            </motion.div>
          )}
          </AnimatePresence>

          <AnimatePresence>
          {error && (
            // Only show token-related messages when in token mode, or always show other errors
            (error.includes('Ve a la pestaña de La Liga') ? loginMethod === 'token' : true) && (
              <motion.div
                className={`mt-6 p-4 rounded-2xl border shadow-sm ${
                  error.includes('token') || error.includes('Ve a la pestaña de La Liga')
                    ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200/50'
                    : 'bg-gradient-to-r from-red-50 to-rose-50 border-red-200/50'
                }`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center justify-center">
                  <div className={`w-5 h-5 rounded-full mr-3 flex items-center justify-center ${
                    error.includes('token') || error.includes('Ve a la pestaña de La Liga') ? 'bg-blue-500' : 'bg-red-500'
                  }`}>
                    <span className="text-white text-xs font-bold">!</span>
                  </div>
                  <p className={`text-sm font-medium ${
                    error.includes('token') || error.includes('Ve a la pestaña de La Liga')
                      ? 'text-blue-700'
                      : 'text-red-700'
                  }`}>{error}</p>
                </div>
              </motion.div>
            )
          )}
          </AnimatePresence>
        </div>

        {/* Disclaimer Footer */}
        <motion.div
          className="mt-8 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          <div className="text-sm text-white/60 space-y-1">
            <p>Desarrollado por <span className="font-medium text-white/80">Externo</span></p>
            <p>Github: <span className="font-medium">https://github.com/Externoak</span></p>
            <p>v{updateService.getCurrentVersion()}</p>
            <p className="text-white/40">Aplicación no oficial para La Liga Fantasy</p>
          </div>
        </motion.div>
      </motion.div>
       {/* Add the Modal component here, it will be invisible until triggered */}
       <TokenModal
        isOpen={isTokenModalOpen}
        onClose={() => setIsTokenModalOpen(false)}
        onSubmit={handleSubmitToken}
        value={tokenInputValue}
        onChange={(e) => setTokenInputValue(e.target.value)}
      />
    </div>
  );
};

export default Login;


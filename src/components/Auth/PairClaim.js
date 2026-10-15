import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Smartphone } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { claimPairing } from '../../services/pairingService';

// Destino del QR de "Conectar móvil": canjea el código de un solo uso y entra
// con la sesión (y la liga) del PC.
const PairClaim = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const setLeague = useAuthStore((state) => state.setLeague);
  const [error, setError] = useState(null);
  // El código es de un solo uso: StrictMode no debe canjearlo dos veces. Se
  // guarda el código (no un booleano) porque abrir otro QR en la misma pestaña
  // solo cambia el hash y reutiliza este componente.
  const claimedRef = useRef(null);

  useEffect(() => {
    if (claimedRef.current === code) return;
    claimedRef.current = code;
    setError(null);

    (async () => {
      try {
        const { tokens, leagueId, leagueName } = await claimPairing(code);
        await login(tokens);
        if (leagueId) setLeague(leagueId, leagueName);
        navigate('/', { replace: true });
      } catch (err) {
        setError(err.message || 'No se pudo conectar con la sesión del PC');
      }
    })();
  }, [code, login, setLeague, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-400 via-primary-500 to-primary-600 flex items-center justify-center px-4">
      <div className="bg-white/95 rounded-3xl shadow-2xl p-8 text-center max-w-sm w-full">
        <div className="w-12 h-12 bg-primary-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Smartphone className="w-6 h-6 text-white" />
        </div>
        {error ? (
          <>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">No se pudo conectar</h2>
            <p className="text-gray-600 text-sm mb-6">
              {error}. Genera un código nuevo en el PC con «Conectar móvil» y vuelve a escanearlo.
            </p>
            <button
              type="button"
              onClick={() => navigate('/', { replace: true })}
              className="w-full bg-gradient-to-r from-primary-500 to-primary-600 text-white font-bold py-3 px-6 rounded-2xl"
            >
              Ir al inicio de sesión
            </button>
          </>
        ) : (
          <>
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Conectando con el PC…</h2>
            <p className="text-gray-600 text-sm">Entrando con la sesión de tu equipo.</p>
          </>
        )}
      </div>
    </div>
  );
};

export default PairClaim;

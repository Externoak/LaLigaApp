import React, { useState, useEffect, useMemo, useCallback } from 'react';
import qrcode from 'qrcode-generator';
import { Smartphone, X, RefreshCw } from 'lucide-react';
import Modal from '../Common/Modal';
import { useAuthStore } from '../../stores/authStore';
import { createPairing, buildPairingUrl } from '../../services/pairingService';

const isLoopbackLink = (url) => {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch { return true; }
};

const renderQrDataUrl = (text) => {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createDataURL(6, 2);
};

/**
 * Muestra un QR que el móvil escanea para entrar con la sesión de este equipo.
 * `serverLinks` son las URLs de red local del servidor (prioridad LAN primero).
 */
const PairDeviceModal = ({ isOpen, onClose, serverLinks }) => {
  const [pairing, setPairing] = useState(null); // { code, expiresAt, lanUrls }
  // Electron ya conoce sus IPs; en navegador las da el servidor al emparejar.
  const lanLinks = useMemo(() => {
    const own = serverLinks.filter((url) => !isLoopbackLink(url));
    return own.length ? own : (pairing?.lanUrls || []).filter((url) => !isLoopbackLink(url));
  }, [serverLinks, pairing]);
  const [selectedLink, setSelectedLink] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  const hasRefreshToken = useAuthStore((state) => !!state.tokens?.refresh_token);

  const generate = useCallback(async () => {
    const { tokens, leagueId, leagueName } = useAuthStore.getState();
    setLoading(true);
    setError(null);
    try {
      const { code, expiresInMs, lanUrls } = await createPairing({ tokens, leagueId, leagueName });
      setPairing({ code, expiresAt: Date.now() + expiresInMs, lanUrls: lanUrls || [] });
    } catch (err) {
      setPairing(null);
      setError(`No se pudo generar el código: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setPairing(null);
      setError(null);
      return;
    }
    generate();
  }, [isOpen, generate]);

  useEffect(() => {
    setSelectedLink((current) => (lanLinks.includes(current) ? current : lanLinks[0] || ''));
  }, [lanLinks]);

  useEffect(() => {
    if (!isOpen || !pairing) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isOpen, pairing]);

  const pairingUrl = pairing && selectedLink ? buildPairingUrl(selectedLink, pairing.code) : null;
  const qrDataUrl = useMemo(() => (pairingUrl ? renderQrDataUrl(pairingUrl) : null), [pairingUrl]);
  const secondsLeft = pairing ? Math.max(0, Math.ceil((pairing.expiresAt - now) / 1000)) : 0;
  const expired = pairing && secondsLeft === 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-500 rounded-lg">
            <Smartphone className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Conectar móvil</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Entra en el móvil con esta misma sesión</p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {!lanLinks.length && !loading && !error ? (
        <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
          No se ha encontrado ninguna dirección de red local. Conecta este equipo a la misma red Wi-Fi que el móvil y vuelve a intentarlo.
        </p>
      ) : (
        <>
          <ol className="text-sm text-gray-700 dark:text-gray-300 space-y-1 mb-4 list-decimal list-inside">
            <li>Conecta el móvil a la misma red Wi-Fi que este equipo.</li>
            <li>Abre la cámara del móvil y apunta a este código.</li>
            <li>Toca el enlace que aparece. ¡Listo!</li>
          </ol>

          <div className="flex flex-col items-center gap-3">
            {error ? (
              <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
            ) : qrDataUrl && !expired ? (
              <img src={qrDataUrl} alt="Código QR para conectar el móvil" className="w-56 h-56 bg-white p-2 rounded-lg" style={{ imageRendering: 'pixelated' }} />
            ) : (
              <div className="w-56 h-56 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 text-sm text-gray-500 dark:text-gray-400 text-center p-4">
                {loading ? 'Generando código…' : 'El código ha caducado'}
              </div>
            )}

            {pairing && !expired && !error && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Caduca en {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')} · solo sirve una vez
              </p>
            )}

            {(expired || error) && (
              <button type="button" onClick={generate} disabled={loading} className="btn-primary flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Generar nuevo código
              </button>
            )}

            {lanLinks.length > 1 && (
              <label className="w-full text-xs text-gray-500 dark:text-gray-400">
                Si el móvil no conecta, prueba otra dirección de este equipo:
                <select
                  value={selectedLink}
                  onChange={(e) => setSelectedLink(e.target.value)}
                  className="input-field mt-1 w-full text-sm"
                >
                  {lanLinks.map((url) => <option key={url} value={url}>{url}</option>)}
                </select>
              </label>
            )}
          </div>

          {!hasRefreshToken && (
            <p className="mt-4 text-xs text-amber-700 dark:text-amber-400">
              Esta sesión no tiene token de renovación: en el móvil caducará cuando caduque aquí.
            </p>
          )}
        </>
      )}
    </Modal>
  );
};

export default PairDeviceModal;

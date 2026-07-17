import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fantasyAPI } from '../services/api';

/**
 * usePlayerFaceBackfill — rellena las caras que faltan en la caché ['allPlayers'].
 *
 * El feed masivo /players devuelve la silueta `no-player` para algunos jugadores
 * (pretemporada / equipos ascendidos) aunque su foto real EXISTA; el endpoint de
 * detalle (`getPlayerDetails`) sí la trae. Flujo:
 *
 *   allPlayers → jugador sin foto → pedir /player/{id} → ¿hay foto?
 *     · sí  → parchearla en la caché ['allPlayers'] (todos los menús que la leen
 *             —Jugadores, LaLiga Teams— se actualizan solos)
 *     · no  → se queda como está (silueta), y NO se vuelve a pedir en la sesión
 *
 * Coste acotado y de una sola vez: cada id se comprueba como mucho una vez por
 * sesión, con concurrencia limitada para no disparar rate-limits. Un 429/404
 * deja al jugador en silueta sin reintentar (evita tormentas de peticiones).
 */

// A nivel de módulo: persisten entre renders, páginas y menús.
const checkedIds = new Set(); // detalle ya resuelto (con o sin foto) → no repetir
const inFlight = new Set();   // petición en curso → no lanzar una duplicada

const isNoFace = (url) => !url || url.includes('/no-player/');
const faceOf = (p) => p?.images?.transparent?.['256x256'] || p?.image;

const extractPlayers = (data) => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.elements)) return data.elements;
    return [];
};

// Ejecuta `worker` sobre `items` con como mucho `limit` en vuelo a la vez.
const runWithConcurrency = async (items, limit, worker) => {
    let cursor = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) {
            const item = items[cursor++];
            await worker(item);
        }
    });
    await Promise.all(runners);
};

const usePlayerFaceBackfill = (playersData, leagueId) => {
    const queryClient = useQueryClient();

    // Leemos los jugadores vía ref para NO depender de la identidad de
    // `playersData`: cada parche cambia ese objeto, y si fuera dependencia el
    // primer parche cancelaría/reiniciaría el efecto. Disparamos por una señal
    // estable (leagueId + nº de jugadores), que no cambia al parchear.
    const playersRef = useRef(playersData);
    playersRef.current = playersData;
    const playerCount = extractPlayers(playersData).length;

    useEffect(() => {
        if (!leagueId || playerCount === 0) return;

        const patchFace = (id, url) => {
            queryClient.setQueryData(['allPlayers'], (old) => {
                if (!old) return old;
                const patchArr = (arr) => arr.map((pl) =>
                    String(pl.id) === String(id)
                        ? {
                            ...pl,
                            image: url,
                            images: {
                                ...(pl.images || {}),
                                transparent: { ...(pl.images?.transparent || {}), '256x256': url },
                                player: url,
                            },
                        }
                        : pl
                );
                if (Array.isArray(old)) return patchArr(old);
                if (Array.isArray(old.data)) return { ...old, data: patchArr(old.data) };
                if (Array.isArray(old.elements)) return { ...old, elements: patchArr(old.elements) };
                return old;
            });
        };

        const missing = extractPlayers(playersRef.current).filter((p) => {
            const id = p?.id != null ? String(p.id) : null;
            return id && isNoFace(faceOf(p)) && !checkedIds.has(id) && !inFlight.has(id);
        });
        if (missing.length === 0) return;

        // Sin flag de cancelación: escribir en la caché compartida es seguro
        // aunque el componente se desmonte, y así StrictMode (doble montaje en
        // dev) no aborta el trabajo. La deduplicación real la hace el guard
        // atómico (check + add sin await en medio) dentro del worker.
        runWithConcurrency(missing, 4, async (p) => {
            const id = String(p.id);
            if (checkedIds.has(id) || inFlight.has(id)) return;
            inFlight.add(id);
            try {
                const resp = await fantasyAPI.getPlayerDetails(p.id, leagueId);
                const url = resp?.data?.playerMaster?.images?.transparent?.['256x256'];
                if (!isNoFace(url)) patchFace(p.id, url);
                checkedIds.add(id);
            } catch (_err) {
                checkedIds.add(id); // 429/404/red → no reintentar esta sesión
            } finally {
                inFlight.delete(id);
            }
        });
    }, [playerCount, leagueId, queryClient]);
};

export default usePlayerFaceBackfill;

// Carte libre BOUFF : fond OpenFreeMap (sans clé) + itinéraire OSRM (serveur
// public de démonstration). Le serveur OSRM public est limité (~1 requête/s,
// usage raisonnable) : on met en cache, on espace les appels et on retombe
// sur une ligne droite si le service ne répond pas.
import { useEffect, useRef, useState } from "react";

  distanceKm: number;

export const mapStyleUrl = (dark) =>
  `https://tiles.openfreemap.org/styles/${dark ? "dark" : "liberty"}`;

export const toLngLat = (c) => [
  c.longitude,
  c.latitude,
];

const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";
const MIN_GAP_MS = 2000; // jamais plus d'une requête toutes les 2 s (toute l'app)
const REFRESH_MS = 60000; // recalcul au plus toutes les 60 s
const MOVE_THRESHOLD_KM = 0.15; // ou si le livreur a bougé de plus de 150 m
const MOTO_KMH = 25; // vitesse moyenne moto en ville pour l'estimation

let lastRequestAt = 0;

export function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function straightRoute(from, to) {
  const d = distanceKm(from, to) * 1.3; // les rues ne sont jamais droites
  return {
    coordinates: [from, to],
    distanceKm: d,
    durationMin: (d / MOTO_KMH) * 60,
    approximate: true,
  };
}

export async function fetchRoute(from, to) {
  const now = Date.now();
  if (now - lastRequestAt < MIN_GAP_MS) return straightRoute(from, to);
  lastRequestAt = now;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const url = `${OSRM_URL}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=simplified&geometries=geojson`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const json = await res.json();
    const route = json?.routes?.[0];
    const coords = route?.geometry?.coordinates ?? [];
    if (json?.code !== "Ok" || coords.length < 2) throw new Error("no route");
    const d = route.distance / 1000;
    return {
      coordinates: coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
      distanceKm: d,
      // OSRM calcule pour une voiture ; à moto en ville on garde le plus réaliste
      durationMin: Math.max(route.duration / 60, (d / MOTO_KMH) * 60 * 0.8),
      approximate: false,
    };
  } catch {
    return straightRoute(from, to);
  } finally {
    clearTimeout(timer);
  }
}

const valid = (c) =>
  !!c &&
  typeof c.latitude === "number" &&
  typeof c.longitude === "number" &&
  !isNaN(c.latitude) &&
  !isNaN(c.longitude) &&
  Math.abs(c.latitude) <= 90 &&
  Math.abs(c.longitude) <= 180 &&
  !(c.latitude === 0 && c.longitude === 0);

/** Itinéraire espacé : recalcule seulement si 60 s passées ou >150 m parcourus. */
export function useRoute(from, to) {
  const [route, setRoute] = useState(null);
  const last = useRef(null);
  const reqId = useRef(0);
  useEffect(() => () => { reqId.current = -1; }, []);

  useEffect(() => {
    if (!valid(from) || !valid(to)) {
      setRoute(null);
      return;
    }
    const prev = last.current;
    const sameTarget =
      prev && distanceKm(prev.to, to) < 0.02;
    const fresh =
      prev &&
      sameTarget &&
      Date.now() - prev.at < REFRESH_MS &&
      distanceKm(prev.from, from) < MOVE_THRESHOLD_KM;
    if (fresh) return;
    last.current = { from, to, at: Date.now() };
    const id = ++reqId.current;
    if (!prev || !sameTarget) setRoute(straightRoute(from, to));
    fetchRoute(from, to).then((r) => {
      if (reqId.current === id) setRoute(r);
    });
  }, [from?.latitude, from?.longitude, to?.latitude, to?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  return route;
}

export function formatEta(min) {
  const m = Math.max(1, Math.round(min));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

export function formatDistance(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace(".", ",")} km`;
}

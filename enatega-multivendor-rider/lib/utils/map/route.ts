// Carte libre BOUFF : fond OpenFreeMap (sans clé) + itinéraire OSRM (serveur
// public de démonstration). Le serveur OSRM public est limité (~1 requête/s,
// usage raisonnable) : on met en cache, on espace les appels et on retombe
// sur une ligne droite si le service ne répond pas.
import { useEffect, useRef, useState } from "react";

export type LatLng = { latitude: number; longitude: number };
export type RouteResult = {
  coordinates: LatLng[];
  distanceKm: number;
  durationMin: number;
  approximate: boolean;
};

export const mapStyleUrl = (dark: boolean) =>
  `https://tiles.openfreemap.org/styles/${dark ? "dark" : "liberty"}`;

export const toLngLat = (c: LatLng): [number, number] => [
  c.longitude,
  c.latitude,
];

const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";
const MIN_GAP_MS = 2000; // jamais plus d'une requête toutes les 2 s (toute l'app)
const REFRESH_MS = 60000; // recalcul au plus toutes les 60 s
const MOVE_THRESHOLD_KM = 0.15; // ou si le livreur a bougé de plus de 150 m
const MOTO_KMH = 25; // vitesse moyenne moto en ville pour l'estimation

let lastRequestAt = 0;

export function distanceKm(a: LatLng, b: LatLng) {
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

export function straightRoute(from: LatLng, to: LatLng): RouteResult {
  const d = distanceKm(from, to) * 1.3; // les rues ne sont jamais droites
  return {
    coordinates: [from, to],
    distanceKm: d,
    durationMin: (d / MOTO_KMH) * 60,
    approximate: true,
  };
}

export async function fetchRoute(from: LatLng, to: LatLng): Promise<RouteResult> {
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
    const coords: [number, number][] = route?.geometry?.coordinates ?? [];
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

const valid = (c?: Partial<LatLng> | null): c is LatLng =>
  !!c &&
  typeof c.latitude === "number" &&
  typeof c.longitude === "number" &&
  !isNaN(c.latitude) &&
  !isNaN(c.longitude) &&
  Math.abs(c.latitude) <= 90 &&
  Math.abs(c.longitude) <= 180 &&
  !(c.latitude === 0 && c.longitude === 0);

/** Itinéraire espacé : recalcule seulement si 60 s passées ou >150 m parcourus. */
export function useRoute(from?: LatLng | null, to?: LatLng | null) {
  const [route, setRoute] = useState<RouteResult | null>(null);
  const last = useRef<{ from: LatLng; to: LatLng; at: number } | null>(null);

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
    let cancelled = false;
    if (!prev || !sameTarget) setRoute(straightRoute(from, to));
    fetchRoute(from, to).then((r) => {
      if (!cancelled) setRoute(r);
    });
    return () => {
      cancelled = true;
    };
  }, [from?.latitude, from?.longitude, to?.latitude, to?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  return route;
}

export function formatEta(min: number) {
  const m = Math.max(1, Math.round(min));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

export function formatDistance(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace(".", ",")} km`;
}

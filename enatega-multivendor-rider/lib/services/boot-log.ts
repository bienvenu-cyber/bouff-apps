// Journal de démarrage silencieux (invisible pour le livreur).
// Chaque étape du démarrage est envoyée à la base BOUFF : si l'app reste
// bloquée sur un écran vide, on voit exactement à quelle étape et pourquoi.
// Volontairement sans dépendance (fetch seulement) pour marcher même si un
// autre module plante au chargement.
import { Platform } from "react-native";

const URL_BASE =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://txyqwlatzlkurjrnlxhe.supabase.co";
const KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_mL30STWaoMLv30cWEZnI8g_e_WZn8j3";

export const BOOT_BUILD = "rider-97";
const SESSION = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const STARTED = Date.now();
const MAX_EVENTS = 60;

let sent = 0;
let queue: Record<string, string>[] = [];
let flushing = false;

function device(): string {
  try {
    const c = (Platform as unknown as { constants?: Record<string, unknown> }).constants ?? {};
    return [Platform.OS, String(Platform.Version), c.Brand, c.Model]
      .filter(Boolean)
      .join(" ")
      .slice(0, 200);
  } catch {
    return Platform.OS;
  }
}

async function flush() {
  if (flushing || queue.length === 0) return;
  flushing = true;
  const batch = queue;
  queue = [];
  try {
    await fetch(`${URL_BASE}/rest/v1/app_boot_logs`, {
      method: "POST",
      headers: {
        apikey: KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(batch),
    });
  } catch {
    // pas de réseau : tant pis, on ne bloque jamais l'app
  } finally {
    flushing = false;
    if (queue.length) setTimeout(flush, 500);
  }
}

export function bootLog(stage: string, message?: unknown) {
  try {
    if (sent >= MAX_EVENTS) return;
    sent += 1;
    let text = "";
    if (message instanceof Error) text = `${message.name}: ${message.message}\n${message.stack ?? ""}`;
    else if (message !== undefined) text = typeof message === "string" ? message : JSON.stringify(message);
    queue.push({
      app: "rider",
      session_id: SESSION,
      stage: `${stage} +${Date.now() - STARTED}ms`.slice(0, 80),
      message: text.slice(0, 2000),
      device: device(),
      build: BOOT_BUILD,
    });
    setTimeout(flush, 50);
  } catch {
    // ignore
  }
}

// Capture toute erreur JS, même celles qui arrivent avant l'affichage.
try {
  const g = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler?: () => (e: unknown, fatal?: boolean) => void;
      setGlobalHandler?: (h: (e: unknown, fatal?: boolean) => void) => void;
    };
  };
  const prev = g.ErrorUtils?.getGlobalHandler?.();
  g.ErrorUtils?.setGlobalHandler?.((e, fatal) => {
    bootLog(fatal ? "fatal" : "error", e);
    // laisse le temps d'envoyer avant que le système ferme l'app
    if (fatal) setTimeout(() => prev?.(e, fatal), 1500);
    else prev?.(e, fatal);
  });
  const tracking = require("promise/setimmediate/rejection-tracking");
  tracking?.enable?.({
    allRejections: true,
    onUnhandled: (_id: number, err: unknown) => bootLog("unhandled_promise", err),
    onHandled: () => {},
  });
} catch {
  // ignore
}

bootLog("js_start");
// Photo de l'état au bout de 15 s et 30 s : on sait si l'app est vivante.
setTimeout(() => bootLog("alive_15s"), 15000);
setTimeout(() => bootLog("alive_30s"), 30000);

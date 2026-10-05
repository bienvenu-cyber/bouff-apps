// Diagnostic temporaire : suit les étapes du démarrage pour les afficher à l'écran.
type Listener = (marks: string[]) => void;

const marks: string[] = [];
const listeners = new Set<Listener>();
const t0 = Date.now();

export function traceStartup(step: string) {
  marks.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${step}`);
  if (marks.length > 25) marks.shift();
  listeners.forEach((l) => l([...marks]));
}

export function subscribeStartup(l: Listener) {
  listeners.add(l);
  l([...marks]);
  return () => {
    listeners.delete(l);
  };
}

traceStartup("JS chargé");

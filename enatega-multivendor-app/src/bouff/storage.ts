import AsyncStorage from "@react-native-async-storage/async-storage";

// Petit stockage synchrone (panier, adresses, commandes suivies) :
// lu en mémoire, recopié sur le téléphone en arrière-plan.
const PREFIX = "bouff/";
const memory = new Map<string, string>();
let hydrated: Promise<void> | null = null;

export function hydrateBouffStorage(): Promise<void> {
  if (!hydrated) {
    hydrated = (async () => {
      try {
        const keys = (await AsyncStorage.getAllKeys()).filter((k) =>
          k.startsWith(PREFIX),
        );
        const pairs = await AsyncStorage.multiGet(keys);
        pairs.forEach(([k, v]) => {
          if (v != null) memory.set(k, v);
        });
      } catch {
        /* stockage indisponible : on repart d'un panier vide */
      }
    })();
  }
  return hydrated;
}

export const bouffStorage = {
  getItem(key: string): string | null {
    return memory.has(key) ? (memory.get(key) as string) : null;
  },
  setItem(key: string, value: string) {
    memory.set(key, value);
    AsyncStorage.setItem(key, value).catch(() => {});
  },
  removeItem(key: string) {
    memory.delete(key);
    AsyncStorage.removeItem(key).catch(() => {});
  },
};

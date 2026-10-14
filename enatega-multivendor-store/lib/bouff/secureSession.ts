import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// Session de connexion gardée dans le coffre chiffré du téléphone
// (Keystore Android / Keychain iOS) au lieu du stockage simple.
// Découpée en morceaux (limite ~2 Ko par entrée), avec reprise de
// l'ancienne session et repli sur le stockage simple si le coffre bloque.
const CHUNK = 1800;
const TIMEOUT_MS = 3000;
const safeKey = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, "_");

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), TIMEOUT_MS)),
  ]);
}

async function secureGet(key: string): Promise<string | null> {
  const k = safeKey(key);
  const count = await withTimeout(SecureStore.getItemAsync(`${k}.n`));
  if (!count) return null;
  const parts: string[] = [];
  for (let i = 0; i < Number(count); i++) {
    const part = await withTimeout(SecureStore.getItemAsync(`${k}.${i}`));
    if (part == null) return null;
    parts.push(part);
  }
  return parts.join("");
}

async function secureRemove(key: string) {
  const k = safeKey(key);
  const count = Number((await SecureStore.getItemAsync(`${k}.n`)) || 0);
  for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${k}.${i}`);
  await SecureStore.deleteItemAsync(`${k}.n`);
}

async function secureSet(key: string, value: string) {
  const k = safeKey(key);
  await secureRemove(key);
  const n = Math.ceil(value.length / CHUNK) || 1;
  for (let i = 0; i < n; i++) {
    await SecureStore.setItemAsync(`${k}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
  }
  await SecureStore.setItemAsync(`${k}.n`, String(n));
}

export const secureSessionStorage =
  Platform.OS === "web"
    ? AsyncStorage
    : {
        async getItem(key: string): Promise<string | null> {
          try {
            const v = await secureGet(key);
            if (v != null) return v;
          } catch {
            /* coffre lent ou indisponible : on tente l'ancien stockage */
          }
          const legacy = await AsyncStorage.getItem(key);
          if (legacy != null) {
            try {
              await withTimeout(secureSet(key, legacy));
              await AsyncStorage.removeItem(key);
            } catch {
              /* migration au prochain lancement */
            }
          }
          return legacy;
        },
        async setItem(key: string, value: string) {
          try {
            await withTimeout(secureSet(key, value));
            await AsyncStorage.removeItem(key);
          } catch {
            await AsyncStorage.setItem(key, value);
          }
        },
        async removeItem(key: string) {
          await AsyncStorage.removeItem(key).catch(() => {});
          try {
            await withTimeout(secureRemove(key));
          } catch {
            /* rien à effacer */
          }
        },
      };

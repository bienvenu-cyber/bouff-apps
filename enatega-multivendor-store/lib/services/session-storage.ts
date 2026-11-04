import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export const getItemAsync = async (key: string): Promise<string | null> =>
  Platform.OS === "web" ? window.sessionStorage.getItem(key) : SecureStore.getItemAsync(key);
export const setItemAsync = async (key: string, value: string): Promise<void> => {
  if (Platform.OS === "web") window.sessionStorage.setItem(key, value);
  else await SecureStore.setItemAsync(key, value);
};
export const deleteItemAsync = async (key: string): Promise<void> => {
  if (Platform.OS === "web") window.sessionStorage.removeItem(key);
  else await SecureStore.deleteItemAsync(key);
};
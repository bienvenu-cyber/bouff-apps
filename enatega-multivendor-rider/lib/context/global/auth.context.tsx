import { clearBouffSession } from "@/lib/bouff/link";
import * as Location from "expo-location";
import React, { useCallback, useEffect, useMemo, useState } from "react";

// Interfaces§
import { getSecureItem, removeSecureItem, setSecureItem } from "@/lib/services/secure-storage";
import { IAuthContext, IAuthProviderProps } from "@/lib/utils/interfaces";
import { useRouter } from "expo-router";
import { useRiderMode } from "@/lib/context/global/rider-mode.context";

export const AuthContext = React.createContext<IAuthContext>(
  {} as IAuthContext,
);

export const AuthProvider: React.FC<IAuthProviderProps> = ({
  client,
  children,
}) => {
  // Hooks
  const router = useRouter();
  const { riderIdKey, tokenKey } = useRiderMode();

  // State
  const [token, setToken] = useState<string>("");
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const hydrateAuth = async () => {
      let timedOut = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const read = getSecureItem(tokenKey);
      // Si la lecture finit en retard, on garde quand même la session :
      // le livreur n'est pas déconnecté pour un téléphone lent.
      read
        .then((late) => {
          if (timedOut && isMounted && late) {
            setToken(late);
            router.replace("/" as never);
          }
        })
        .catch(() => {});
      try {
        const storedToken = await Promise.race([
          read,
          new Promise<null>((resolve) => {
            timer = setTimeout(() => {
              timedOut = true;
              resolve(null);
            }, 4000);
          }),
        ]);

        if (isMounted && storedToken) {
          setToken(storedToken);
        }
      } catch (e) {
        if (__DEV__) console.log("Auth hydrate error:", e);
      } finally {
        if (timer) clearTimeout(timer);
        if (isMounted) {
          setIsAuthReady(true);
        }
      }
    };

    hydrateAuth();

    return () => {
      isMounted = false;
    };
  }, [tokenKey]);

  const setTokenAsync = useCallback(
    async (token: string) => {
      await setSecureItem(tokenKey, token);
      await client.clearStore();
      setToken(token);
    },
    [client, tokenKey],
  );

  const logout = useCallback(async () => {
    setToken("");

    try {
      await Promise.all([removeSecureItem(tokenKey), removeSecureItem(riderIdKey), clearBouffSession()]);

      try {
        await client.clearStore();
      } catch (cacheError) {
        if (__DEV__) {
          console.log("Error clearing Apollo cache during logout:", cacheError);
        }
      }

      try {
        const hasLocationUpdates =
          await Location.hasStartedLocationUpdatesAsync("RIDER_LOCATION");
        if (hasLocationUpdates) {
          await Location.stopLocationUpdatesAsync("RIDER_LOCATION");
        }
      } catch (locationError) {
        if (__DEV__) {
          console.log("Error stopping location updates:", locationError);
        }
      }
    } catch (e) {
      if (__DEV__) {
        console.log("Logout Error: ", e);
      }
    } finally {
      router.replace("/login");
    }
  }, [client, riderIdKey, router, tokenKey]);

  const values: IAuthContext = useMemo(
    () => ({
      token: token ?? "",
      isAuthReady,
      logout,
      setTokenAsync,
    }),
    [token, isAuthReady, logout, setTokenAsync],
  );

  return <AuthContext.Provider value={values}>{children}</AuthContext.Provider>;
};

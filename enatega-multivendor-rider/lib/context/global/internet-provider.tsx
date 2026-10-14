import React, { createContext, useContext, useEffect, useState } from "react";
import { View, Text } from "react-native";
import * as Network from 'expo-network'

import { NoInternetIcon } from "@/lib/ui/useable-components/svg";

interface InternetContextProps {
  isConnected: boolean;
}

const InternetContext = createContext<InternetContextProps | undefined>(
  undefined,
);

export const useInternet = (): InternetContextProps => {
  // Hooks

  const context = useContext(InternetContext);
  if (!context) {
    throw new Error("useInternet must be used within an InternetProvider");
  }
  return context;
};

const InternetProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isConnected, setIsConnected] = useState<boolean|undefined>(true);

  useEffect(() => {
    const checkConnection = async () => {
      try {
      const networkState = await Network.getNetworkStateAsync()
      // "inconnu" n'est pas "hors ligne" : seul un false explicite bloque.
      setIsConnected(networkState.isConnected !== false)
      } catch {
        setIsConnected(true)
      }
    }

    // Initial check
    checkConnection()

    // Optional: Poll every few seconds (no event listener in expo-network)
    const interval = setInterval(checkConnection, 5000)

    return () => clearInterval(interval) // Clean up
  }, [])

  if (!isConnected) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0B0B0C", padding: 24 }}>
        <NoInternetIcon />
        <Text style={{ color: "#F5F0E6", fontSize: 22, fontWeight: "700", textAlign: "center", marginTop: 12 }}>
          Pas de connexion internet
        </Text>
      </View>
    );
  }

  return (
    <InternetContext.Provider value={{ isConnected }}>
      {children}
    </InternetContext.Provider>
  );
};

export default InternetProvider;

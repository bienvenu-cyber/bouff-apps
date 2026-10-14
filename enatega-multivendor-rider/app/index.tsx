import { Href, Redirect } from "expo-router";
import { useContext, useEffect } from "react";
import { bootLog } from "@/lib/services/boot-log";
import { ActivityIndicator, View } from "react-native";

// Context
import { AuthContext } from "@/lib/context/global/auth.context";

// Constant
import { ROUTES } from "@/lib/utils/constants";

function App() {
  const { token, isAuthReady } = useContext(AuthContext);
  useEffect(() => {
    if (isAuthReady) bootLog("auth_ready", token ? "connecte" : "deconnecte");
  }, [isAuthReady, token]);

  if (!isAuthReady) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0B0B0C",
        }}
      >
        <ActivityIndicator size="large" color="#FF7A1A" />
      </View>
    );
  }

  if (!token) {
    return <Redirect href={ROUTES.login as Href} />;
  }

  return <Redirect href={ROUTES.home as Href} />;
}

export default App;

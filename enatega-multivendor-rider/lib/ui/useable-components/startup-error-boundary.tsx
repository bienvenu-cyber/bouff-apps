import { Component, ErrorInfo, ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { bootLog } from "@/lib/services/boot-log";

// Si un écran plante, on affiche un message propre avec « Réessayer »
// au lieu d'un écran vide. L'erreur est envoyée à Sentry.
interface State {
  hasError: boolean;
}

export default class StartupErrorBoundary extends Component<
  { children: ReactNode },
  State
> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    bootLog("error_boundary", `${error?.message}\n${error?.stack ?? ""}\n${info?.componentStack ?? ""}`);
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@sentry/react-native").captureException(error);
    } catch {
      // ignore
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#0B0B0C",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Text style={{ color: "#F5F0E6", fontSize: 20, fontWeight: "700", textAlign: "center" }}>
          Un problème est survenu
        </Text>
        <Text style={{ color: "#B8B2A7", marginTop: 8, fontSize: 14, textAlign: "center" }}>
          Touche « Réessayer ». Si ça continue, ferme puis rouvre l’app.
        </Text>
        <Pressable
          onPress={() => this.setState({ hasError: false })}
          style={{
            marginTop: 24,
            backgroundColor: "#FF7A1A",
            borderRadius: 12,
            paddingVertical: 14,
            paddingHorizontal: 32,
          }}
        >
          <Text style={{ color: "#0B0B0C", fontWeight: "700" }}>Réessayer</Text>
        </Pressable>
      </View>
    );
  }
}

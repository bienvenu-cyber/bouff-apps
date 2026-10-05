import { Component, ErrorInfo, ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

// Diagnostic : au lieu d'un écran blanc quand l'app plante au démarrage,
// on affiche le message d'erreur pour pouvoir le photographier.
interface State {
  error: Error | null;
  componentStack: string;
}

export default class StartupErrorBoundary extends Component<
  { children: ReactNode },
  State
> {
  state: State = { error: null, componentStack: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? "" });
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@sentry/react-native").captureException(error);
    } catch {
      // ignore
    }
  }

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={{ flex: 1, backgroundColor: "#0B0B0C", paddingTop: 60 }}>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Text style={{ color: "#FFC21A", fontSize: 22, fontWeight: "700" }}>
            Oups, l’app a planté au démarrage
          </Text>
          <Text style={{ color: "#F5F0E6", marginTop: 8, fontSize: 14 }}>
            Prends une photo de cet écran et envoie-la.
          </Text>
          <Text
            selectable
            style={{ color: "#FF6B5B", marginTop: 20, fontSize: 15, fontWeight: "600" }}
          >
            {error.name}: {error.message}
          </Text>
          <Text
            selectable
            style={{ color: "#B8B2A7", marginTop: 16, fontSize: 11 }}
          >
            {(error.stack ?? "").split("\n").slice(0, 12).join("\n")}
          </Text>
          <Text
            selectable
            style={{ color: "#8A857C", marginTop: 16, fontSize: 11 }}
          >
            {componentStack.split("\n").slice(0, 15).join("\n")}
          </Text>
          <Pressable
            onPress={() => this.setState({ error: null, componentStack: "" })}
            style={{
              marginTop: 24,
              backgroundColor: "#FFC21A",
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#0B0B0C", fontWeight: "700" }}>Réessayer</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }
}

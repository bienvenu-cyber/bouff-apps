import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { subscribeStartup } from "@/lib/utils/startup-trace";

// Diagnostic temporaire : affiche les étapes du démarrage en bas de l'écran.
export default function StartupTraceOverlay() {
  const [marks, setMarks] = useState<string[]>([]);
  useEffect(() => subscribeStartup(setMarks), []);

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 8,
        right: 8,
        bottom: 40,
        zIndex: 10000,
        elevation: 10000,
        backgroundColor: "rgba(0,0,0,0.75)",
        borderColor: "#FFC21A",
        borderWidth: 1,
        borderRadius: 8,
        padding: 8,
      }}
    >
      <Text style={{ color: "#FFC21A", fontSize: 12, fontWeight: "700" }}>
        Diagnostic démarrage
      </Text>
      {marks.map((m, i) => (
        <Text key={i} style={{ color: "#FFFFFF", fontSize: 11 }}>
          {m}
        </Text>
      ))}
    </View>
  );
}

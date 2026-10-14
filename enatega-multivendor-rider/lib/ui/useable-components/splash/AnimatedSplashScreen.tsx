import * as SplashScreen from "expo-splash-screen";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import AnimatedSplash from "./AnimatedSplash";
import { bootLog } from "@/lib/services/boot-log";

// Keep the native OS splash up until our theme-aware JS splash has painted, so
// there is no black/white flash at the native -> JS handoff.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function AnimatedSplashScreen({
  ready = false,
  children,
}: {
  ready?: boolean;
  children: ReactNode;
}) {
  const [splashDone, setSplashDone] = useState(false);
  const finish = useCallback(() => setSplashDone(true), []);

  // Hand off from the native static splash to AnimatedSplash. Safe to hide on
  // mount because both layers share the same themed background color.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    bootLog("splash_js_mounted");
  }, []);

  // Sécurité : le voile de démarrage ne dépend jamais uniquement de
  // l'animation. Une fois l'app prête, il disparaît au plus tard 4 s après,
  // et dans tous les cas au bout de 12 s.
  useEffect(() => {
    const hard = setTimeout(() => {
      setSplashDone((done) => {
        if (!done) bootLog("splash_forced_12s");
        return true;
      });
    }, 12000);
    return () => clearTimeout(hard);
  }, []);
  useEffect(() => {
    if (!ready) return;
    bootLog("app_ready");
    const id = setTimeout(() => {
      setSplashDone((done) => {
        if (!done) bootLog("splash_forced_after_ready");
        return true;
      });
    }, 4000);
    return () => clearTimeout(id);
  }, [ready]);
  useEffect(() => {
    if (splashDone) bootLog("splash_done");
  }, [splashDone]);

  return (
    <View style={{ flex: 1, backgroundColor: "#0B0B0C" }}>
      {children}
      {!splashDone && <AnimatedSplash ready={ready} onFinish={finish} />}
    </View>
  );
}

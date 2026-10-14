import { useApptheme } from "@/lib/context/global/theme.context";
import { useUserContext } from "@/lib/context/global/user.context";
import { Stack, usePathname } from "expo-router";
import { useEffect } from "react";
import { bootLog } from "@/lib/services/boot-log";

export default function RootStackLayout() {
  // Hooks
  const { appTheme } = useApptheme();
  const pathname = usePathname();
  useEffect(() => {
    bootLog("route", pathname);
  }, [pathname]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerTintColor: appTheme.mainTextColor,
        headerTitleStyle: { color: appTheme.mainTextColor },
      }}
      initialRouteName="(tabs)"
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" />
      <Stack.Screen
        name="order-detail"
        options={{
          // headerShown: false,
          headerTintColor: appTheme.fontMainColor,
        }}
      />
      <Stack.Screen name="chat" options={{ headerShown: false }} />
    </Stack>
  );
}

// Hooks
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// Constants
import { Colors } from "@/lib/utils/constants";

// Interfaces & Types
import { AppThemeContext } from "@/lib/utils/interfaces/app-theme";
import { app_theme } from "@/lib/utils/types/theme";

// React Native AsyncStorage
import AsyncStorage from "@react-native-async-storage/async-storage";

// Core
import { Appearance } from "react-native";

// Context
const ThemeContext = createContext<AppThemeContext>({
  currentTheme: "light",
  toggleTheme: () => {},
  appTheme: Colors.light,
});

export default function AppThemeProvidor({
  children,
}: {
  children: ReactNode;
}) {
  // Color Scheme State
  const colorScheme = Appearance.getColorScheme();

  // States
  const [currentTheme, setCurrentTheme] = useState<app_theme>("dark");
  const [appTheme, setAppTheme] = useState(Colors.dark);

  // Methods
  const getCurrentAppTheme = useCallback(async () => {
        const localTheme = await AsyncStorage.getItem("app_theme");
    // BOUFF : sombre par défaut, le téléphone ne décide plus.
    const theme = localTheme === "light" ? "light" : "dark";
    Appearance.setColorScheme(theme as app_theme);
    setCurrentTheme(theme as app_theme);
    setAppTheme(
      theme === "light"
        ? Colors.light
        : theme === "dark"
          ? Colors.dark
          : Colors.light,
    );
  }, []);

  // Handlers
  const toggleTheme = useCallback((val: app_theme) => {
    const updatedVal = val === "light" ? "dark" : "light";
    setAppTheme(Colors[updatedVal] ?? Colors.light);
    setCurrentTheme(updatedVal);
    // Appearance.setColorScheme(val === "light" ? "dark" : "light");
    void AsyncStorage.setItem("app_theme", updatedVal);
  }, []);

  useEffect(() => {
    getCurrentAppTheme();
  }, [colorScheme, getCurrentAppTheme]);

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      // Thème choisi dans l'app uniquement (pas le réglage du téléphone).
      void colorScheme;
    });

    return () => {
      subscription.remove();
    };
  }, []);
  const value = useMemo(
    () => ({ toggleTheme, currentTheme, appTheme }),
    [appTheme, currentTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export const useApptheme = () => useContext(ThemeContext);

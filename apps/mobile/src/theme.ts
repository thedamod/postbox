import { useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";

import { dark, light, type Palette } from "@postbox/ui/tokens";

import { appFonts, type AppFontWeight } from "./fonts";

export type { AppFontWeight };

export type ThemePreference = "system" | "light" | "dark";

const PREFERENCE_KEY = "postbox.theme.preference";

function normalizePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

/**
 * App theme. The user preference (system/light/dark) persists in secure
 * storage; "system" follows the OS live. Palette, StatusBar style, and
 * every themed component resolve from the single `scheme` below.
 */
export function useTheme(): {
  palette: Palette;
  scheme: "light" | "dark";
  fonts: typeof appFonts;
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
} {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    let cancelled = false;
    SecureStore.getItemAsync(PREFERENCE_KEY)
      .then((stored) => {
        if (!cancelled && stored) setPreferenceState(normalizePreference(stored));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = (next: ThemePreference) => {
    const normalized = normalizePreference(next);
    setPreferenceState(normalized);
    SecureStore.setItemAsync(PREFERENCE_KEY, normalized).catch(() => undefined);
  };

  const scheme: "light" | "dark" =
    preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference;

  return {
    palette: scheme === "dark" ? dark : light,
    scheme,
    fonts: appFonts,
    preference,
    setPreference,
  };
}

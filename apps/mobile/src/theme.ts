import { useColorScheme } from "react-native";

import { dark, light, type Palette } from "@postbox/ui/tokens";

import { appFonts, type AppFontWeight } from "./fonts";

export type { AppFontWeight };

export function useTheme(): {
  palette: Palette;
  scheme: "light" | "dark";
  fonts: typeof appFonts;
} {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  return {
    palette: scheme === "dark" ? dark : light,
    scheme,
    fonts: appFonts,
  };
}

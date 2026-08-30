import { useFonts } from "expo-font";
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";

export const appFonts = {
  regular: "DMSans-Regular",
  medium: "DMSans-Medium",
  bold: "DMSans-Bold",
} as const;

export type AppFontWeight = keyof typeof appFonts;

/** Loads the bundled DM Sans weights; returns true once ready to render. */
export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    "DMSans-Regular": DMSans_400Regular,
    "DMSans-Medium": DMSans_500Medium,
    "DMSans-Bold": DMSans_700Bold,
  });
  return loaded;
}

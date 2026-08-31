import { BlurView } from "expo-blur";
import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";

import { withAlpha } from "../lib/color";
import { useTheme } from "../theme";

type GlassViewProps = {
  /** Blur intensity (1–100). */
  intensity?: number;
  /** Force a tint; defaults to the active color scheme. */
  tint?: "light" | "dark";
  /** Android blur implementation. */
  blurMethod?: "none" | "dimezisBlurView" | "dimezisBlurViewSdk31Plus";
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

/**
 * Frosted-glass surface: an expo-blur backdrop plus a translucent card tint so
 * content that scrolls beneath it reads as blurred glass.
 *
 * Uses `pointerEvents="box-none"` so the BlurView never claims touch gestures
 * (which would otherwise swallow scrolls from the parent ScrollView/FlatList on
 * Android), while direct children like Pressables stay tappable.
 */
export function GlassView({
  intensity = 70,
  tint,
  blurMethod,
  style,
  children,
}: GlassViewProps) {
  const { palette, scheme } = useTheme();
  const resolvedTint = tint ?? (scheme === "dark" ? "dark" : "light");

  return (
    <BlurView
      intensity={intensity}
      tint={resolvedTint}
       // Dimezis requires a blurTarget ref. Without one it logs a warning and
       // silently disables blur, so use the safe platform default here.
       blurMethod={blurMethod ?? "none"}
      pointerEvents="box-none"
      style={[
       { backgroundColor: scheme === "dark" ? "rgba(255,255,255,0.12)" : withAlpha(palette.card, 0.78) },
        style,
      ]}
    >
      {children}
    </BlurView>
  );
}

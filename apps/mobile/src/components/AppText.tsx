import { Text as RNText, type TextProps as RNTextProps, type StyleProp, type TextStyle } from "react-native";

import { useTheme } from "../theme";

export type AppTextProps = RNTextProps;

function resolveWeight(style?: StyleProp<TextStyle>): "regular" | "medium" | "bold" {
  const items = Array.isArray(style) ? style : [style];
  let weight: string | undefined;

  for (const item of items) {
    if (!item) continue;
    const candidate = (item as TextStyle).fontWeight;
    if (candidate) weight = typeof candidate === "string" ? candidate : String(candidate);
  }

  const numeric =
    weight === "bold"
      ? 700
      : weight === "medium"
        ? 500
        : Number(weight) || 400;

  if (numeric >= 700) return "bold";
  if (numeric >= 500) return "medium";
  return "regular";
}

/**
 * Themed Text: foreground color + DM Sans, with the correct weight file chosen
 * from the resolved `fontWeight` in the style (regular < 500, medium < 700,
 * bold >= 700).
 */
export function AppText({ style, ...props }: AppTextProps) {
  const { palette, fonts } = useTheme();
  const weight = resolveWeight(style);

  return (
    <RNText style={[{ color: palette.foreground, fontFamily: fonts[weight] }, style]} {...props} />
  );
}

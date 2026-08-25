/**
 * Platform-agnostic design tokens. Web consumers map these to CSS variables
 * (see globals.css); React Native consumers import the hex values directly.
 */

export type Palette = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  input: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  ring: string;
};

export const light: Palette = {
  background: "#ffffff",
  foreground: "#1a1a1e",
  card: "#ffffff",
  cardForeground: "#1a1a1e",
  muted: "#f4f4f5",
  mutedForeground: "#71717a",
  border: "#e4e4e7",
  input: "#e4e4e7",
  primary: "#4f46e5",
  primaryForeground: "#ffffff",
  secondary: "#f4f4f5",
  secondaryForeground: "#27272a",
  accent: "#eef2ff",
  accentForeground: "#4338ca",
  destructive: "#dc2626",
  destructiveForeground: "#ffffff",
  ring: "#a5b4fc",
};

export const dark: Palette = {
  background: "#0a0a0a",
  foreground: "#f5f5f5",
  card: "#171717",
  cardForeground: "#f5f5f5",
  muted: "#1c1c1c",
  mutedForeground: "#8e8e93",
  border: "rgba(255, 255, 255, 0.06)",
  input: "#141414",
  primary: "#f5f5f5",
  primaryForeground: "#0a0a0a",
  secondary: "rgba(255, 255, 255, 0.04)",
  secondaryForeground: "#f5f5f5",
  accent: "rgba(255, 255, 255, 0.08)",
  accentForeground: "#f5f5f5",
  destructive: "#f87171",
  destructiveForeground: "#1a1a1e",
  ring: "#6366f1",
};

/** Accent hues used for tags / labels / avatars. */
export const tagColors = {
  rose: "#e11d48",
  amber: "#d97706",
  emerald: "#059669",
  sky: "#0284c7",
  violet: "#7c3aed",
  slate: "#475569",
};

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 40,
  "4xl": 48,
} as const;

export const fontSize = {
  xs: 12,
  sm: 13,
  base: 15,
  lg: 17,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
} as const;

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

export const fontFamily = {
  sans: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`,
  mono: `"SF Mono", ui-monospace, Menlo, Consolas, monospace`,
} as const;

export const shadow = {
  sm: "0 1px 2px rgb(0 0 0 / 0.05)",
  md: "0 4px 12px -2px rgb(0 0 0 / 0.08)",
  lg: "0 12px 32px -8px rgb(0 0 0 / 0.16)",
} as const;

export const tokens = {
  color: { light, dark },
  tagColors,
  radius,
  spacing,
  fontSize,
  fontWeight,
  fontFamily,
  shadow,
} as const;

export type Tokens = typeof tokens;

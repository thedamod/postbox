/** Converts a `#rrggbb`/`#rgb` hex color into an `rgba()` string. */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;

  const num = Number.parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(num)) return hex;

  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

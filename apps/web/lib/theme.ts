/**
 * Single source of truth for the web theme preference.
 *
 * - Values: "light" | "dark" | "system" (system follows the OS live).
 * - localStorage (`mail-theme`, kept for compatibility) is the client store.
 * - Cookie mirrors (`mail-theme`, `mail-theme-resolved`) let the root layout
 *   paint the correct `.dark` class server-side with zero flash. Scripts
 *   rendered by React only exist in flight data and never execute before
 *   paint, so the server paint is the only deterministic pre-paint path.
 * - Runtime updates go through `useTheme()` in `./use-theme`, which also
 *   follows live OS changes in system mode and syncs other tabs.
 */

export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "mail-theme";

/** Cookie mirrors so the server can paint the theme with zero flash. */
export const THEME_COOKIE = "mail-theme";
export const THEME_RESOLVED_COOKIE = "mail-theme-resolved";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export const THEME_CHANGED_EVENT = "postbox:theme-changed";

export function normalizePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function readPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return normalizePreference(raw ? JSON.parse(raw) : "system");
  } catch {
    return "system";
  }
}

export function resolveTheme(
  preference: ThemePreference,
  systemDark: boolean,
): "light" | "dark" {
  if (preference === "dark") return "dark";
  if (preference === "light") return "light";
  return systemDark ? "dark" : "light";
}

export function systemPrefersDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export const THEME_COLOR_LIGHT = "#fafafa";
export const THEME_COLOR_DARK = "#0a0a0a";

/** Apply the resolved theme to the document (class, color-scheme, meta). */
export function paintTheme(resolved: "light" | "dark"): void {
  const dark = resolved === "dark";
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
}

/** Persist preference + last resolved outcome for the server paint. */
export function persistTheme(preference: ThemePreference, resolved: "light" | "dark"): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // Ignore storage failures; cookies still carry the server paint.
  }
  try {
    const attrs = `path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
    document.cookie = `${THEME_COOKIE}=${encodeURIComponent(JSON.stringify(preference))}; ${attrs}`;
    document.cookie = `${THEME_RESOLVED_COOKIE}=${resolved}; ${attrs}`;
  } catch {
    // Cookies unavailable — session still applies locally.
  }
}

/** Read a cookie value by name from a Cookie header (server-safe). */
export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Server-side theme resolution from cookies. Explicit light/dark paints
 * exactly; system mode reuses the last resolved outcome so cold loads don't
 * flash (defaults to light when unknown; the client corrects live).
 */
export function resolveServerTheme(cookieHeader: string | null): "light" | "dark" {
  let preference: ThemePreference = "system";
  try {
    const raw = readCookie(cookieHeader, THEME_COOKIE);
    preference = normalizePreference(raw ? JSON.parse(raw) : "system");
  } catch {
    preference = "system";
  }
  if (preference === "dark") return "dark";
  if (preference === "light") return "light";
  return readCookie(cookieHeader, THEME_RESOLVED_COOKIE) === "dark" ? "dark" : "light";
}

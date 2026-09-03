"use client";

import { useCallback, useEffect, useState } from "react";
import {
  THEME_CHANGED_EVENT,
  THEME_STORAGE_KEY,
  normalizePreference,
  paintTheme,
  persistTheme,
  readPreference,
  resolveTheme,
  systemPrefersDark,
  type ThemePreference,
} from "./theme";

/**
 * Live theme state. Applies the stored preference on mount (matching the
 * pre-paint boot script), follows OS changes while in system mode, and
 * stays in sync with other tabs via storage + broadcast events.
 */
export function useTheme(): {
  preference: ThemePreference;
  resolved: "light" | "dark";
  setPreference: (next: ThemePreference) => void;
} {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [systemDark, setSystemDark] = useState(false);

  // Initial read after mount (values already painted pre-hydration).
  useEffect(() => {
    setPreferenceState(readPreference());
    setSystemDark(systemPrefersDark());
  }, []);

  // Follow OS changes live so system mode never goes stale.
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Cross-tab sync: native storage events (other tabs) + broadcast (same tab).
  useEffect(() => {
    const sync = () => setPreferenceState(readPreference());
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(THEME_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(THEME_CHANGED_EVENT, sync);
    };
  }, []);

  const resolved = resolveTheme(preference, systemDark);

  // Paint on every change and mirror to cookies so the server paints the
  // same theme on the next cold load (resolved outcome included, so system
  // mode doesn't flash either).
  useEffect(() => {
    paintTheme(resolved);
    persistTheme(preference, resolved);
  }, [preference, resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    const normalized = normalizePreference(next);
    setPreferenceState(normalized);
    setSystemDark(systemPrefersDark());
    persistTheme(normalized, resolveTheme(normalized, systemPrefersDark()));
    window.dispatchEvent(new CustomEvent(THEME_CHANGED_EVENT));
  }, []);

  return { preference, resolved, setPreference };
}

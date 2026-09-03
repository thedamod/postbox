"use client";

import { useEffect, useState } from "react";
import { Button } from "@postbox/ui";
import { cn } from "@postbox/ui";

type Theme = "light" | "dark" | "system";

function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem("mail-theme", JSON.stringify(theme));
  } catch {
    // Ignore storage failures; the theme still applies for this session.
  }
}

/** Appearance settings: theme preference persisted like the root layout script. */
export default function AppearanceSettingsPage() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("mail-theme");
      const saved = raw ? (JSON.parse(raw) as Theme) : "system";
      setTheme(saved === "light" || saved === "dark" ? saved : "system");
    } catch {
      setTheme("system");
    }
  }, []);

  const choose = (next: Theme) => {
    setTheme(next);
    applyTheme(next);
  };

  return (
    <section className="flex flex-col gap-3" aria-label="Appearance">
      <h2 className="text-sm font-semibold">Appearance</h2>
      <div className="flex gap-2">
        {(["light", "dark", "system"] as Theme[]).map((option) => (
          <Button
            key={option}
            variant={theme === option ? "default" : "outline"}
            size="sm"
            onClick={() => choose(option)}
            aria-pressed={theme === option}
            className={cn("capitalize")}
          >
            {option}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        System follows your OS preference. The choice applies instantly and persists across visits.
      </p>
    </section>
  );
}

"use client";

import { Button } from "@postbox/ui";
import { cn } from "@postbox/ui";
import { useTheme } from "@/lib/use-theme";
import type { ThemePreference } from "@/lib/theme";

/** Appearance settings: theme preference persisted across visits. */
export default function AppearanceSettingsPage() {
  const { preference, setPreference } = useTheme();

  return (
    <section className="flex flex-col gap-3" aria-label="Appearance">
      <h2 className="text-sm font-semibold">Appearance</h2>
      <div className="flex gap-2">
        {(["light", "dark", "system"] as ThemePreference[]).map((option) => (
          <Button
            key={option}
            variant={preference === option ? "default" : "outline"}
            size="sm"
            onClick={() => setPreference(option)}
            aria-pressed={preference === option}
            className={cn("capitalize")}
          >
            {option}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        System follows your OS preference live. The choice applies instantly and persists across visits.
      </p>
    </section>
  );
}

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

let loaded = false;

function parseEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) result[key] = value;
  }

  return result;
}

/**
 * Next.js only auto-loads `.env` from the app directory, but this monorepo
 * keeps shared secrets at the repo root. Load that file once at startup so
 * the backend sees them. Real environment variables always win.
 */
export function loadRootEnv(): void {
  if (loaded) return;
  loaded = true;

  const candidates = [
    process.cwd(),
    resolve(process.cwd(), ".."),
    resolve(process.cwd(), "../.."),
  ];

  for (const dir of candidates) {
    const envPath = join(dir, ".env");
    if (!existsSync(envPath)) continue;

    for (const [key, value] of Object.entries(parseEnv(readFileSync(envPath, "utf8")))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
    break;
  }
}
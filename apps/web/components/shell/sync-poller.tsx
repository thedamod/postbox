"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 30_000;
const INITIAL_DELAY_MS = 5_000;

/**
 * Foreground sync poll: waits a beat after mount, then re-syncs every 30s
 * and whenever the tab becomes visible again. The sync response carries a
 * persisted per-account revision, so most ticks are cheap no-ops and only
 * a real change triggers a refresh of lists and counts.
 */
export function SyncPoller({
  accountId,
  initialRevision,
}: {
  accountId: string;
  initialRevision: number;
}) {
  const router = useRouter();
  const revision = useRef(initialRevision);

  useEffect(() => {
    revision.current = initialRevision;
  }, [accountId, initialRevision]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const sync = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch(`/api/sync/${encodeURIComponent(accountId)}?wait=1`, {
          method: "POST",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { result?: { revision?: number } };
        const next = data.result?.revision;
        if (typeof next === "number" && next > revision.current) {
          revision.current = next;
          router.refresh();
        }
      } catch {
        // Offline or backend busy — the next tick retries.
      }
    };

    const tick = () => {
      void sync().finally(() => {
        if (!stopped) timer = setTimeout(tick, POLL_INTERVAL_MS);
      });
    };
    timer = setTimeout(tick, INITIAL_DELAY_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [accountId, router]);

  return null;
}

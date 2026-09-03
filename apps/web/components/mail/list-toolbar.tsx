"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, Search } from "lucide-react";
import { Input } from "@postbox/ui";
import { cn } from "@postbox/ui";
import { threadQueryToSearch } from "@/lib/mail/query-params";
import type { ThreadListQuery, ThreadSort } from "@/lib/mail/types";

const SORTS: { id: ThreadSort; label: string }[] = [
  { id: "date", label: "Date" },
  { id: "from", label: "Sender" },
  { id: "subject", label: "Subject" },
];

/**
 * List controls (mirrors redakt `list-toolbar.tsx`): debounced search plus
 * unread / attachment filters and sort, all synced to the URL query string.
 */
export function ListToolbar({ initial }: { initial: ThreadListQuery }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initial.q ?? "");

  // Debounce search into the URL (250ms, like redakt).
  useEffect(() => {
    const needle = q.trim();
    const current = searchParams.get("q") ?? "";
    if (needle === current) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (needle) params.set("q", needle);
      else params.delete("q");
      params.delete("offset");
      const search = params.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    }, 250);
    return () => clearTimeout(timer);
  }, [q, pathname, router, searchParams]);

  // Reset the box when navigating between folders.
  useEffect(() => {
    setQ(searchParams.get("q") ?? "");
  }, [pathname, searchParams]);

  const update = (patch: ThreadListQuery & { q?: string | undefined }) => {
    const params = new URLSearchParams(searchParams.toString());
    const merged: ThreadListQuery = {
      q: patch.q !== undefined ? patch.q : (searchParams.get("q") ?? undefined),
      unread: patch.unread !== undefined ? patch.unread : searchParams.get("unread") === "1",
      hasAttachment: patch.hasAttachment !== undefined ? patch.hasAttachment : searchParams.get("hasAttachment") === "1",
      sort: patch.sort ?? ((searchParams.get("sort") as ThreadSort) || "date"),
      order: patch.order ?? ((searchParams.get("order") as "asc" | "desc") || "desc"),
    };
    const next = threadQueryToSearch({ ...merged, q: merged.q?.trim() ? merged.q : undefined });
    // Preserve nothing else; paging restarts on filter change.
    const search = next.toString();
    void params;
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  };

  const unreadOnly = searchParams.get("unread") === "1";
  const withAttachments = searchParams.get("hasAttachment") === "1";
  const sort = (searchParams.get("sort") as ThreadSort) || "date";

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search mail…"
          aria-label="Search mail"
          className="pl-8"
        />
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <button
          type="button"
          aria-pressed={unreadOnly}
          onClick={() => update({ unread: !unreadOnly })}
          className={cn("rounded-md px-2 py-1", unreadOnly ? "bg-accent font-medium" : "hover:bg-accent/60")}
        >
          Unread
        </button>
        <button
          type="button"
          aria-pressed={withAttachments}
          onClick={() => update({ hasAttachment: !withAttachments })}
          className={cn("rounded-md px-2 py-1", withAttachments ? "bg-accent font-medium" : "hover:bg-accent/60")}
        >
          Attachments
        </button>
        <label className="ml-auto flex items-center gap-1 text-muted-foreground">
          <ArrowUpDown className="h-3.5 w-3.5" />
          <span className="sr-only">Sort by</span>
          <select
            value={sort}
            onChange={(event) => update({ sort: event.target.value as ThreadSort })}
            className="rounded-md bg-transparent py-1 text-xs"
          >
            {SORTS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

"use client";

/**
 * Persistent workspace tabs (mirrors redakt `lib/mail/workspace-tabs.ts`).
 * Open threads are remembered per user+account in localStorage so a reload
 * restores the working set. A `CustomEvent` keeps multiple shell instances
 * on the same page in sync.
 */

export type WorkspaceTab = {
  threadId: string;
  folder: string;
  subject?: string;
};

const PREFIX = "postbox:workspace-tabs:v1";

export function workspaceTabsKey(accountId: string): string {
  return `${PREFIX}:${accountId}`;
}

export function loadWorkspaceTabs(accountId: string): WorkspaceTab[] {
  try {
    const raw = localStorage.getItem(workspaceTabsKey(accountId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WorkspaceTab[];
    return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
  } catch {
    return [];
  }
}

export function saveWorkspaceTabs(accountId: string, tabs: WorkspaceTab[]): void {
  try {
    localStorage.setItem(workspaceTabsKey(accountId), JSON.stringify(tabs.slice(0, 10)));
    window.dispatchEvent(new CustomEvent(workspaceTabsKey(accountId)));
  } catch {
    // Storage full or unavailable — tabs simply don't persist.
  }
}

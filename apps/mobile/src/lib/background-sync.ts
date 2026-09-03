import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";

import { API_BASE_URL } from "./api";
import {
  getLastNotifiedId,
  notifyNewMail,
  setLastNotifiedId,
  unseenPreviews,
  type NewMailPreview,
} from "./notifications";

export const MAIL_SYNC_TASK = "postbox-mail-sync";

type SyncPreviewShape = {
  messageId: number;
  subject: string;
  from: string;
  snippet: string;
};

type SyncFolderShape = {
  path: string;
  newMessages: number;
  previews: SyncPreviewShape[];
};

type SyncAccountShape = {
  account: string;
  folders: SyncFolderShape[];
  changed: boolean;
  revision: number;
  error?: string;
};

/**
 * Background entry point: sync every account through the server's sync
 * engine (which reports changed/revision + fresh-arrival previews) and
 * raise a local notification for genuinely new inbox mail.
 *
 * Runs on iOS background-fetch and Android headless JS; must stay short,
 * dependency-free, and total (never throw out).
 */
export async function runBackgroundMailSync(): Promise<BackgroundFetch.BackgroundFetchResult> {
  try {
    const accountsRes = await fetch(`${API_BASE_URL}/api/accounts`);
    if (!accountsRes.ok) return BackgroundFetch.BackgroundFetchResult.Failed;
    const { accounts } = (await accountsRes.json()) as {
      accounts: Array<{ id: number }>;
    };

    let foundNew = false;

    for (const account of accounts) {
      try {
        const syncRes = await fetch(`${API_BASE_URL}/api/sync/${account.id}?wait=1`, {
          method: "POST",
        });
        if (!syncRes.ok) continue;
        const { result } = (await syncRes.json()) as { result: SyncAccountShape };
        if (!result || !result.changed) continue;

        // Only the inbox pages the user. Sent/Drafts/Trash arrivals (e.g.
        // our own sends) must never buzz the phone.
        const inboxPreviews: NewMailPreview[] = result.folders
          .filter((folder) => folder.path === "INBOX")
          .flatMap((folder) => folder.previews ?? []);
        if (inboxPreviews.length === 0) continue;

        const lastNotified = await getLastNotifiedId(account.id);
        const fresh = unseenPreviews(inboxPreviews, lastNotified, new Set());
        if (fresh.length === 0) continue;

        await notifyNewMail(account.id, fresh);
        const maxId = Math.max(...fresh.map((preview) => preview.messageId));
        await setLastNotifiedId(account.id, maxId);
        foundNew = true;
      } catch {
        // One account failing must not fail the whole task.
        continue;
      }
    }

    return foundNew
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
}

TaskManager.defineTask(MAIL_SYNC_TASK, async () => {
  try {
    return await runBackgroundMailSync();
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/** ~15 min cadence; survives reboot and app termination where the OS allows. */
export async function registerBackgroundMailSync(): Promise<void> {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(MAIL_SYNC_TASK);
    if (registered) return;
    await BackgroundFetch.registerTaskAsync(MAIL_SYNC_TASK, {
      minimumInterval: 15 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch {
    // Background execution unavailable (e.g. simulator) — foreground sync
    // in the inbox still drives notifications while the app is open.
  }
}

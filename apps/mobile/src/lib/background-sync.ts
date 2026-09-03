import type * as BackgroundFetch from "expo-background-fetch";
import type * as TaskManager from "expo-task-manager";

import { API_BASE_URL } from "./api";
import {
  getLastNotifiedId,
  notifyNewMail,
  setLastNotifiedId,
  unseenPreviews,
  type NewMailPreview,
} from "./notifications";

export const MAIL_SYNC_TASK = "postbox-mail-sync";

declare const require: (moduleId: string) => any;

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

type FetchResult = BackgroundFetch.BackgroundFetchResult;

function loadBackgroundFetch(): typeof BackgroundFetch | null {
  try {
    return require("expo-background-fetch") as typeof BackgroundFetch;
  } catch {
    return null;
  }
}

function resultOf(
  backgroundFetch: typeof BackgroundFetch | null,
  foundNew: boolean,
): FetchResult {
  // BackgroundFetchResult is an enum; fall back to a raw value when the
  // native module is unavailable (shouldn't happen inside a running task).
  if (!backgroundFetch) return "failed" as unknown as FetchResult;
  return foundNew
    ? backgroundFetch.BackgroundFetchResult.NewData
    : backgroundFetch.BackgroundFetchResult.NoData;
}

/**
 * Background entry point: sync every account through the server's sync
 * engine (which reports changed/revision + fresh-arrival previews) and
 * raise a local notification for genuinely new inbox mail.
 *
 * Runs on iOS background-fetch and Android headless JS; must stay short,
 * dependency-free, and total (never throw out).
 */
export async function runBackgroundMailSync(): Promise<FetchResult> {
  const backgroundFetch = loadBackgroundFetch();
  const failed = () =>
    backgroundFetch
      ? backgroundFetch.BackgroundFetchResult.Failed
      : ("failed" as unknown as FetchResult);

  try {
    const accountsRes = await fetch(`${API_BASE_URL}/api/accounts`);
    if (!accountsRes.ok) return failed();
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

    return resultOf(backgroundFetch, foundNew);
  } catch {
    return failed();
  }
}

let taskDefined = false;

/**
 * Define + register the periodic sync task. Safe to call in Expo Go: the
 * native modules are required lazily, and anything missing degrades to a
 * no-op (foreground sync in the inbox still drives notifications while the
 * app is open).
 */
export async function setupBackgroundMailSync(): Promise<void> {
  try {
    const taskManager = require("expo-task-manager") as typeof TaskManager;
    const backgroundFetch = loadBackgroundFetch();
    if (!backgroundFetch) return;

    if (!taskDefined) {
      taskDefined = true;
      taskManager.defineTask(MAIL_SYNC_TASK, async () => {
        try {
          return await runBackgroundMailSync();
        } catch {
          return backgroundFetch.BackgroundFetchResult.Failed;
        }
      });
    }

    const registered = await taskManager.isTaskRegisteredAsync(MAIL_SYNC_TASK);
    if (registered) return;
    await backgroundFetch.registerTaskAsync(MAIL_SYNC_TASK, {
      minimumInterval: 15 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch {
    // Background execution unavailable — foreground sync still covers the
    // open-app case.
  }
}

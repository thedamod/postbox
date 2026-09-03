import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import type * as Notifications from "expo-notifications";

export type NewMailPreview = {
  messageId: number;
  subject: string;
  from: string;
  snippet: string;
};

export type NotificationTarget = {
  accountId: number;
  messageId: number;
};

const ENABLED_KEY = "postbox.notifications.enabled";
const LAST_NOTIFIED_KEY = "postbox.notifications.lastNotified";

declare const require: (moduleId: string) => any;

type NotificationsModule = typeof Notifications;

let cachedModule: NotificationsModule | null | undefined;
let handlerInstalled = false;

/**
 * Lazy native-module load. Importing `expo-notifications` at startup crashes
 * Expo Go (remote push was stripped from Go in SDK 53 — the stub throws on
 * evaluation), so every access goes through here and degrades to `null`.
 * Metro still bundles the literal require; dev builds resolve it normally.
 */
function loadNotifications(): NotificationsModule | null {
  if (cachedModule !== undefined) return cachedModule;
  try {
    cachedModule = require("expo-notifications") as NotificationsModule;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

/** False inside Expo Go (or anywhere the native module is missing). */
export function isNotificationsAvailable(): boolean {
  return loadNotifications() != null;
}

/** Foreground presentation: banners + sound even while the app is open. */
export function installNotificationHandler(): void {
  if (handlerInstalled) return;
  handlerInstalled = true;
  try {
    loadNotifications()?.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    // Expo Go or missing native module — notifications simply stay off.
  }
}

export async function areNotificationsEnabled(): Promise<boolean> {
  try {
    const raw = await SecureStore.getItemAsync(ENABLED_KEY);
    // Default on: first launch asks for permission, the toggle opts out.
    return raw !== "0";
  } catch {
    return true;
  }
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    // Settings toggle stays local-only when secure storage is unavailable.
  }
}

/** Last notified stored message id per account (dedupes across restarts). */
export async function getLastNotifiedId(accountId: number): Promise<number> {
  try {
    const raw = await SecureStore.getItemAsync(`${LAST_NOTIFIED_KEY}:${accountId}`);
    const id = raw == null ? 0 : Number(raw);
    return Number.isInteger(id) && id > 0 ? id : 0;
  } catch {
    return 0;
  }
}

export async function setLastNotifiedId(accountId: number, messageId: number): Promise<void> {
  try {
    await SecureStore.setItemAsync(`${LAST_NOTIFIED_KEY}:${accountId}`, String(messageId));
  } catch {
    // Best effort; the in-memory set still dedupes within a session.
  }
}

/**
 * Request alert/sound/badge permission. Physical device required for push
 * tokens, but local notifications work wherever the OS grants permission.
 * Returns false in Expo Go, where the notifications module is unavailable.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const native = loadNotifications();
  if (!native) return false;
  if (!Device.isDevice) return false;
  try {
    const current = await native.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const next = await native.requestPermissionsAsync();
    return next.granted;
  } catch {
    return false;
  }
}

/** Filter previews down to genuinely unseen arrivals. */
export function unseenPreviews(
  previews: NewMailPreview[],
  lastNotifiedId: number,
  seenIds: Set<number>,
): NewMailPreview[] {
  return previews.filter(
    (preview) => preview.messageId > lastNotifiedId && !seenIds.has(preview.messageId),
  );
}

function previewBody(preview: NewMailPreview): string {
  const snippet = preview.snippet.trim();
  if (snippet && snippet !== preview.subject.trim()) return snippet.slice(0, 140);
  return preview.subject;
}

/**
 * Banner for fresh arrivals. One notification per message (up to a cap)
 * keeps taps deep-linkable; the OS groups them by thread automatically.
 * Always advances the watermark, even when the native module is missing,
 * so arrivals are never re-processed later.
 */
export async function notifyNewMail(
  accountId: number,
  previews: NewMailPreview[],
): Promise<void> {
  if (previews.length === 0) return;

  const native = (await areNotificationsEnabled()) ? loadNotifications() : null;
  if (native) {
    try {
      if (await ensureNotificationPermission()) {
        const shown = previews.slice(0, 3);
        for (const preview of shown) {
          const target: NotificationTarget = { accountId, messageId: preview.messageId };
          await native.scheduleNotificationAsync({
            content: {
              title: preview.from,
              subtitle: previews.length > 1 ? undefined : preview.subject,
              body: previews.length > 1 ? `${preview.subject} — ${previewBody(preview)}` : previewBody(preview),
              data: target,
            },
            trigger: null,
          });
        }
      }
    } catch {
      // Scheduling failed — still advance the watermark below.
    }
  }

  // Advance past every fresh arrival, not just the shown ones, so the next
  // sync doesn't re-notify for the overflow.
  const maxId = Math.max(...previews.map((preview) => preview.messageId));
  await setLastNotifiedId(accountId, maxId);
}

/** Tap on a mail notification → deep link target (or null for other taps). */
export function addNotificationTapListener(
  onTap: (target: NotificationTarget) => void,
): { remove: () => void } {
  try {
    const native = loadNotifications();
    if (!native) return { remove: () => undefined };
    const subscription = native.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Partial<NotificationTarget> | null;
      if (data && typeof data.accountId === "number" && typeof data.messageId === "number") {
        onTap({ accountId: data.accountId, messageId: data.messageId });
      }
    });
    return { remove: () => subscription.remove() };
  } catch {
    return { remove: () => undefined };
  }
}

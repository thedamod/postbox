import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

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

let handlerInstalled = false;

/** Foreground presentation: banners + sound even while the app is open. */
export function installNotificationHandler(): void {
  if (handlerInstalled) return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
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
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!Device.isDevice) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
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
 */
export async function notifyNewMail(
  accountId: number,
  previews: NewMailPreview[],
): Promise<void> {
  if (previews.length === 0) return;
  if (!(await areNotificationsEnabled())) return;
  if (!(await ensureNotificationPermission())) return;

  const shown = previews.slice(0, 3);
  for (const preview of shown) {
    const target: NotificationTarget = { accountId, messageId: preview.messageId };
    await Notifications.scheduleNotificationAsync({
      content: {
        title: preview.from,
        subtitle: previews.length > 1 ? undefined : preview.subject,
        body: previews.length > 1 ? `${preview.subject} — ${previewBody(preview)}` : previewBody(preview),
        data: target,
      },
      trigger: null,
    });
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
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Partial<NotificationTarget> | null;
    if (data && typeof data.accountId === "number" && typeof data.messageId === "number") {
      onTap({ accountId: data.accountId, messageId: data.messageId });
    }
  });
  return { remove: () => subscription.remove() };
}

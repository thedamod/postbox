import { getProvider, type ClientDeps } from "../deps";
import type { ProviderSession } from "../provider";
import type { StoredMessage } from "../types";

export function getMessage(deps: ClientDeps, id: number): StoredMessage {
  const message = deps.storage.getMessage(id);

  if (!message) {
    throw new Error(`Message "${id}" does not exist.`);
  }

  return message;
}

async function withSession<T>(
  deps: ClientDeps,
  accountId: number,
  fn: (session: ProviderSession) => Promise<T>,
): Promise<T> {
  const account = deps.storage.getAccount(accountId);

  if (!account) {
    throw new Error(`Account "${accountId}" does not exist.`);
  }

  const session = getProvider(deps, account.provider).open(account);

  await session.connect();

  try {
    return await fn(session);
  } finally {
    await session.logout();
  }
}

type FlagUpdate = {
  flag: "seen" | "starred";
  value: boolean;
  imap: { flag: "\\Seen" | "\\Starred"; operation: "add" | "remove" };
};

async function applyFlag(deps: ClientDeps, messageId: number, update: FlagUpdate): Promise<StoredMessage> {
  const message = getMessage(deps, messageId);

  deps.storage.setMessageFlag(messageId, update.flag, update.value);

  // Best-effort remote update; the next sync reconciles if it fails.
  if (message.providerUid != null) {
    await withSession(deps, message.accountId, async (session) => {
      await session.setMessageFlags({
        path: message.folder,
        uid: message.providerUid!,
        add: update.imap.operation === "add" ? [update.imap.flag] : undefined,
        remove: update.imap.operation === "remove" ? [update.imap.flag] : undefined,
      });
    }).catch((error) => {
      console.error(`[messages] IMAP flag update failed for ${messageId}:`, error);
    });
  }

  return getMessage(deps, messageId);
}

export function markRead(deps: ClientDeps, messageId: number): Promise<StoredMessage> {
  return applyFlag(deps, messageId, {
    flag: "seen",
    value: true,
    imap: { flag: "\\Seen", operation: "add" },
  });
}

export function markUnread(deps: ClientDeps, messageId: number): Promise<StoredMessage> {
  return applyFlag(deps, messageId, {
    flag: "seen",
    value: false,
    imap: { flag: "\\Seen", operation: "remove" },
  });
}

export function star(deps: ClientDeps, messageId: number): Promise<StoredMessage> {
  return applyFlag(deps, messageId, {
    flag: "starred",
    value: true,
    imap: { flag: "\\Starred", operation: "add" },
  });
}

export function unstar(deps: ClientDeps, messageId: number): Promise<StoredMessage> {
  return applyFlag(deps, messageId, {
    flag: "starred",
    value: false,
    imap: { flag: "\\Starred", operation: "remove" },
  });
}

async function moveToFolder(
  deps: ClientDeps,
  messageId: number,
  requestedFolder: string,
  specialUse?: string,
): Promise<StoredMessage> {
  const message = getMessage(deps, messageId);

  if (message.providerUid == null) {
    deps.storage.moveMessageFolder(messageId, message.accountId, message.folder, requestedFolder);
    return getMessage(deps, messageId);
  }

  await withSession(deps, message.accountId, async (session) => {
    const folders = await session.listFolders();
    const destination = folders.find((folder) => folder.path === requestedFolder)?.path
      ?? (specialUse ? folders.find((folder) => folder.specialUse === specialUse)?.path : undefined)
      ?? requestedFolder;

    await session.moveMessage({
      path: message.folder,
      uid: message.providerUid!,
      destination,
    });
    deps.storage.moveMessageFolder(messageId, message.accountId, message.folder, destination);
  });

  return getMessage(deps, messageId);
}

export function trash(deps: ClientDeps, messageId: number): Promise<StoredMessage> {
  return moveToFolder(deps, messageId, "[Gmail]/Trash", "\\Trash");
}

export function move(
  deps: ClientDeps,
  messageId: number,
  folder: string,
): Promise<StoredMessage> {
  const specialUse = folder === "[Gmail]/All Mail" ? "\\All" : undefined;
  return moveToFolder(deps, messageId, folder, specialUse);
}

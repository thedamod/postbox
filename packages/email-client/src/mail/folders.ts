import { getProvider, type ClientDeps } from "../deps";
import type { EmailFolder } from "../types";

export async function listFolders(
  deps: ClientDeps,
  accountId: number,
): Promise<Array<EmailFolder & { total?: number; unread?: number }>> {
  const account = deps.storage.getAccount(accountId);

  if (!account) {
    throw new Error(`Account "${accountId}" does not exist.`);
  }

  const provider = getProvider(deps, account.provider);
  const session = provider.open(account);

  await session.connect();

  try {
    const folders = await session.listFolders();

    return folders.map((folder) => ({
      ...folder,
      total: deps.storage.countMessagesByFolder(accountId, folder.path),
      unread: deps.storage.countMessagesByFolder(accountId, folder.path, {
        unreadOnly: true,
      }),
    }));
  } finally {
    await session.logout();
  }
}
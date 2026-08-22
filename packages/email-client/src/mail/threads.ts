import type { ClientDeps } from "../deps";
import type { ThreadListOptions } from "../storage";
import type { StoredMessage, StoredThread } from "../types";

export function listThreads(
  deps: ClientDeps,
  accountId: number,
  opts: ThreadListOptions = {},
): StoredThread[] {
  return deps.storage.listThreads(accountId, opts);
}

export function getThread(deps: ClientDeps, threadId: number): {
  thread: StoredThread;
  messages: StoredMessage[];
} {
  const thread = deps.storage.getThread(threadId);

  if (!thread) {
    throw new Error(`Thread "${threadId}" does not exist.`);
  }

  const messages = deps.storage.listMessagesByThread(threadId);

  return { thread, messages };
}
import type { MailFolderId } from "./types";

/**
 * Folder definitions: maps each frontend `MailFolderId` to the underlying
 * storage folder path. `storageFolder: null` means "all mail" (no filter),
 * mirroring how the legacy page treated the "All Mail" view.
 */
export type FolderDef = {
  id: MailFolderId;
  label: string;
  storageFolder: string | null;
};

export const FOLDER_DEFS: FolderDef[] = [
  { id: "inbox", label: "Inbox", storageFolder: "INBOX" },
  { id: "starred", label: "Starred", storageFolder: "[Gmail]/Starred" },
  { id: "sent", label: "Sent", storageFolder: "[Gmail]/Sent Mail" },
  { id: "drafts", label: "Drafts", storageFolder: "[Gmail]/Drafts" },
  { id: "all", label: "All Mail", storageFolder: null },
  { id: "spam", label: "Spam", storageFolder: "[Gmail]/Spam" },
  { id: "trash", label: "Trash", storageFolder: "[Gmail]/Trash" },
  { id: "archived", label: "Archived", storageFolder: "[Gmail]/All Mail" },
];

export function folderDefForView(view: string): FolderDef | null {
  if (view.startsWith("collection:")) return null;
  return FOLDER_DEFS.find((def) => def.id === view) ?? null;
}

export function mailFoldersForAccount(): FolderDef[] {
  return FOLDER_DEFS;
}

import type { EmailStorage } from "../storage";

export type Tag = {
  id: number;
  accountId: number;
  name: string;
  description: string | null;
  color: string | null;
  createdAt: string;
};

export type TagService = {
  readonly storage: EmailStorage;

  list(accountId: number): Tag[];
  get(id: number): Tag;
  getByName(accountId: number, name: string): Tag | null;
  create(
    accountId: number,
    input: { name: string; description?: string | null; color?: string | null },
  ): Tag;
  update(
    id: number,
    patch: { name?: string; description?: string | null; color?: string | null },
  ): Tag;
  remove(id: number): void;
  attachTag(messageId: number, tagId: number, source?: string, confidence?: number): void;
  detachTag(messageId: number, tagId: number): void;
  tagsForMessage(messageId: number): Tag[];
};

export function createTagService(storage: EmailStorage): TagService {
  function get(id: number): Tag {
    const tag = storage.getTag(id);
    if (!tag) throw new Error(`Tag "${id}" does not exist.`);
    return tag;
  }

  function create(
    accountId: number,
    input: { name: string; description?: string | null; color?: string | null },
  ): Tag {
    const existing = storage.getTagByName(accountId, input.name);
    if (existing) {
      throw new Error(`Tag "${input.name}" already exists for this account.`);
    }
    return storage.createTag(accountId, input);
  }

  return {
    storage,
    list: (accountId) => storage.listTags(accountId),
    get,
    getByName: (accountId, name) => storage.getTagByName(accountId, name),
    create,
    update: (id, patch) => storage.updateTag(id, patch),
    remove: (id) => storage.removeTag(id),
    attachTag: (messageId, tagId, source, confidence) =>
      storage.attachTag(messageId, tagId, source, confidence),
    detachTag: (messageId, tagId) => storage.detachTag(messageId, tagId),
    tagsForMessage: (messageId) => storage.tagsForMessage(messageId),
  };
}
import type { ClientDeps } from "./deps";
import type { StoredMessage } from "./types";

export type SearchOptions = {
  q: string;
  limit?: number;
  offset?: number;
};

export type SearchResult = {
  query: string;
  total: number;
  messages: StoredMessage[];
};

function prefixTerm(term: string): string {
  return `"${term.replace(/"/g, '""')}"*`;
}

function toFtsQuery(raw: string): string {
  const terms: string[] = [];
  const tokenPattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|(\S+)/g;

  for (const match of raw.matchAll(tokenPattern)) {
    const value = (match[1] ?? match[2] ?? "")
      .replace(/["\\]/g, " ")
      .trim();
    if (!value) continue;

    const field = /^(subject|from|to):(.+)$/i.exec(value);
    if (field) {
      const column = field[1]!.toLowerCase() === "subject"
        ? "subject"
        : field[1]!.toLowerCase() === "from"
          ? "from_json"
          : "to_json";
      const term = field[2]!.replace(/[^\p{L}\p{N}@._+\-]/gu, "");
      if (term) terms.push(`${column} : ${prefixTerm(term)}`);
      continue;
    }

    const tokens = value
      .split(/\s+/)
      .map((term) => term.replace(/[^\p{L}\p{N}@._+\-]/gu, ""))
      .filter(Boolean);

    if (tokens.length > 0) {
      // Prefix matching is what users expect while typing a sender or subject.
      // The sanitization above keeps FTS operators out of the MATCH expression.
      terms.push(tokens.map(prefixTerm).join(" "));
    }
  }

  return terms.join(" AND ");
}

export function query(deps: ClientDeps, accountId: number, opts: SearchOptions): SearchResult {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);

  const match = toFtsQuery(opts.q);

  if (!match) {
    return { query: opts.q, total: 0, messages: [] };
  }

  const { total, ids } = deps.storage.searchMessages(accountId, match, { limit, offset });
  const byId = new Map(deps.storage.getMessages(ids).map((message) => [message.id, message]));
  const messages = ids.flatMap((id) => {
    const message = byId.get(id);
    return message ? [message] : [];
  });

  return {
    query: opts.q,
    total,
    messages,
  };
}

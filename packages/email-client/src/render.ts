/**
 * HTML email image helpers (framework-agnostic, safe for web and React
 * Native). Remote (`http(s)`) image sources are rewritten to pass through
 * the backend image proxy, so senders never see the reader's IP and images
 * simply load — no per-message approval gate. `data:`/`cid:`/relative
 * sources are left untouched.
 */

/** True for absolute remote URLs — the only sources we ever rewrite. */
export function isRemoteImageUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

const IMG_SRC_PATTERN = /<img\b([^>]*?)\bsrc\s*=\s*(["'])(https?:\/\/[^"'\s>]+)\2/gi;

/**
 * Rewrite every remote `<img src>` in `html` via `rewrite`. Runs after
 * sanitization on the web; the only transformation consumers need.
 */
export function rewriteRemoteImageSources(
  html: string,
  rewrite: (url: string) => string,
): string {
  return html.replace(
    IMG_SRC_PATTERN,
    (match, attrs: string, quote: string, url: string) =>
      `<img${attrs}src=${quote}${rewrite(url)}${quote}`,
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mediaFilename(src: string, fallback: string): string {
  try {
    const path = new URL(src).pathname.split("/").filter(Boolean).pop() ?? "";
    const name = decodeURIComponent(path).trim();
    return name || fallback;
  } catch {
    return fallback;
  }
}

function mediaSrc(tag: string, inner: string): string | null {
  const direct = tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2]?.trim();
  if (direct) return direct;
  return inner.match(/<source\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2]?.trim() ?? null;
}

/**
 * Replace `<video>`/`<audio>` embeds with a plain download/open link card.
 * Embedded players render as broken overlapping boxes (and would fetch
 * sender-hosted bytes directly, bypassing the image proxy, which only
 * serves pixels), so both viewers downgrade them to an explicit link with
 * the file name. `<embed>`/`<object>`/`<iframe>` never survive sanitization
 * on the web; this covers the tags that do.
 */
export function replaceMediaWithLinks(html: string): string {
  const replace = (
    tag: "video" | "audio",
    attrs: string,
    inner: string,
  ): string => {
    const src = mediaSrc(attrs, inner);
    if (!src) return "";
    const label = tag === "video" ? "Watch video" : "Listen";
    const filename = escapeHtml(mediaFilename(src, `${tag} attachment`));
    const href = escapeHtml(src);
    return (
      `<a class="mail-media" href="${href}" target="_blank" rel="noopener noreferrer">` +
      `<span class="mail-media-icon">${tag === "video" ? "&#9654;" : "&#9835;"}</span>` +
      `<span class="mail-media-text"><strong>${label}</strong> &middot; ${filename}</span></a>`
    );
  };

  // Paired tags first, then any unclosed leftovers (self-closing or not).
  return html
    .replace(/<video\b([^>]*)>([\s\S]*?)<\/video\s*>/gi, (_m, attrs: string, inner: string) =>
      replace("video", attrs, inner),
    )
    .replace(/<video\b([^>]*?)\/?>/gi, (_m, attrs: string) => replace("video", attrs, ""))
    .replace(/<audio\b([^>]*)>([\s\S]*?)<\/audio\s*>/gi, (_m, attrs: string, inner: string) =>
      replace("audio", attrs, inner),
    )
    .replace(/<audio\b([^>]*?)\/?>/gi, (_m, attrs: string) => replace("audio", attrs, ""));
}

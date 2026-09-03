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

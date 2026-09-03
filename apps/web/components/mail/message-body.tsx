"use client";

import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import {
  replaceMediaWithLinks,
  rewriteRemoteImageSources,
} from "@postbox/email-client/domain";

/**
 * Sanitized message body: HTML is sanitized, embedded players are downgraded
 * to explicit open/download links (they render broken and bypass the pixel
 * proxy), then remote pixels are rewritten to the privacy-safe `/api/image`
 * proxy (the sender only ever sees our server fetch, never the reader), so
 * images simply load — no per-message approval gate and no broken boxes.
 */
export function MessageBody({ html, text }: { html?: string | null; text?: string }) {
  const [sanitized, setSanitized] = useState<string | null>(null);

  useEffect(() => {
    if (!html) {
      setSanitized(null);
      return;
    }
    const clean = DOMPurify.sanitize(html, {
      ADD_ATTR: ["target", "rel"],
      FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
      FORBID_ATTR: ["srcset"],
    });
    const doc = new DOMParser().parseFromString(clean, "text/html");
    for (const anchor of doc.querySelectorAll("a")) {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
    }
    const withLinks = replaceMediaWithLinks(doc.body.innerHTML);
    const withProxiedImages = rewriteRemoteImageSources(
      withLinks,
      (url) => `/api/image?url=${encodeURIComponent(url)}`,
    );
    setSanitized(withProxiedImages);
  }, [html]);

  if (sanitized) {
    return (
      <div
        className="mail-body mail-body-paper max-w-none text-sm leading-relaxed"
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    );
  }

  return <p className="whitespace-pre-wrap text-sm leading-relaxed">{text ?? "(no content)"}</p>;
}

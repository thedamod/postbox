"use client";

import { useEffect, useState } from "react";
import DOMPurify from "dompurify";

/**
 * Sanitized message body: HTML is
 * sanitized with DOMPurify and remote images are gated behind `showImages`.
 */
export function MessageBody({ html, text }: { html?: string | null; text?: string }) {
  const [showImages, setShowImages] = useState(false);
  const [sanitized, setSanitized] = useState<string | null>(null);
  const [blockedImages, setBlockedImages] = useState(false);

  useEffect(() => {
    if (!html) {
      setSanitized(null);
      setBlockedImages(false);
      return;
    }
    const clean = DOMPurify.sanitize(html, {
      ADD_ATTR: ["target", "rel"],
      FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
      FORBID_ATTR: ["srcset"],
    });
    const doc = new DOMParser().parseFromString(clean, "text/html");
    const images = [...doc.querySelectorAll("img")];
    const remote = images.filter((img) => {
      const src = img.getAttribute("src") ?? "";
      return src.startsWith("http://") || src.startsWith("https://");
    });
    if (remote.length > 0 && !showImages) {
      for (const img of remote) img.removeAttribute("src");
      setBlockedImages(true);
    } else {
      setBlockedImages(false);
    }
    for (const anchor of doc.querySelectorAll("a")) {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
    }
    setSanitized(doc.body.innerHTML);
  }, [html, showImages]);

  if (sanitized) {
    return (
      <div>
        {blockedImages && (
          <button
            type="button"
            onClick={() => setShowImages(true)}
            className="mb-2 rounded-md bg-muted px-2 py-1 text-xs hover:bg-accent"
          >
            Show remote images
          </button>
        )}
        <div
          className="mail-body mail-body-paper max-w-none text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: sanitized }}
        />
      </div>
    );
  }

  return <p className="whitespace-pre-wrap text-sm leading-relaxed">{text ?? "(no content)"}</p>;
}

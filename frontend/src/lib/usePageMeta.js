// Tiny hook to update <title>, <meta name="description">, and Open Graph
// tags from inside a React page without pulling in react-helmet.
//
// Strategy: instead of inserting NEW <meta> tags (which would leave the
// static defaults in index.html competing for the same property name and
// could confuse scrapers), we LOOK UP the existing tag by its property /
// name attribute and update its `content`. If no tag exists yet, we
// create one. On unmount we restore the original content so SPA
// navigation away from a legal page doesn't leak its title to other pages.

import { useEffect } from "react";

function selectorFor(kind, key) {
  // kind: "name" | "property"
  return `meta[${kind}="${key}"]`;
}

function upsertMeta(kind, key, content) {
  if (content == null) return null;
  let el = document.head.querySelector(selectorFor(kind, key));
  const prev = el ? el.getAttribute("content") : null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(kind, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
  return { el, prev, created: prev === null && el.getAttribute("content") === content && !el.parentNode ? false : prev === null };
}

export function usePageMeta({
  title,
  description,
  ogTitle,
  ogDescription,
  ogImage = "/og-default.png",
  ogType = "website",
} = {}) {
  useEffect(() => {
    const prevTitle = document.title;
    if (title) document.title = title;

    const updates = [
      ["name", "description", description],
      ["property", "og:title", ogTitle || title],
      ["property", "og:description", ogDescription || description],
      ["property", "og:type", ogType],
      ["property", "og:url", window.location.href],
      ["property", "og:image", ogImage],
      ["name", "twitter:card", "summary_large_image"],
      ["name", "twitter:title", ogTitle || title],
      ["name", "twitter:description", ogDescription || description],
    ];

    const records = [];
    for (const [kind, key, value] of updates) {
      if (value == null) continue;
      const el = document.head.querySelector(selectorFor(kind, key));
      const prev = el ? el.getAttribute("content") : null;
      const created = !el;
      const node = el || (() => {
        const m = document.createElement("meta");
        m.setAttribute(kind, key);
        document.head.appendChild(m);
        return m;
      })();
      node.setAttribute("content", value);
      records.push({ node, prev, created });
    }

    return () => {
      document.title = prevTitle;
      for (const r of records) {
        if (r.created) {
          r.node.parentNode?.removeChild(r.node);
        } else if (r.prev !== null) {
          r.node.setAttribute("content", r.prev);
        }
      }
    };
  }, [title, description, ogTitle, ogDescription, ogImage, ogType]);
}

import { useEffect } from "react";
import { BRAND } from "@/lib/brand/tokens";

// Paint the document background cream for the public pages. The app's <body> is
// transparent (no global bg), so any viewport region the page's own root div
// doesn't paint falls through to the browser's default canvas — which reads as a
// dark band when scrolling a tall page. Setting it on <html>/<body> guarantees a
// cream ground edge-to-edge. Restored on unmount so provider/account screens
// (client-side nav) keep their own chrome.
export function usePublicChrome() {
  useEffect(() => {
    const targets = [document.documentElement, document.body];
    const prev = targets.map((el) => el.style.backgroundColor);
    for (const el of targets) el.style.backgroundColor = BRAND.cream;
    return () => targets.forEach((el, i) => (el.style.backgroundColor = prev[i]));
  }, []);
}

// This create.xyz / React-Router-Hono app does not wire route-module `meta`/`links`
// exports into <head> (no page in the app has a <title>; <Meta/>/<Links/> render
// nothing here), and the page body is client-only (root's <ClientOnly>). So we
// manage <head> on the client: set document.title and upsert the SEO meta/link
// tags. Crawlers that execute JS (Google) still read these; App Store review just
// needs the page to load. Tags are tagged data-head-managed and cleaned up/replaced
// when the language changes.
export function useDocumentHead(descriptors) {
  const key = JSON.stringify(descriptors);
  useEffect(() => {
    const managed = [];
    for (const d of descriptors) {
      if (d.title != null) {
        document.title = d.title;
        continue;
      }
      const el =
        d.tagName === "link"
          ? document.createElement("link")
          : document.createElement("meta");
      for (const [k, v] of Object.entries(d)) {
        if (k === "tagName") continue;
        if (k === "hrefLang") el.setAttribute("hreflang", v);
        else if (k === "crossOrigin") el.setAttribute("crossorigin", v);
        else el.setAttribute(k, v);
      }
      el.setAttribute("data-head-managed", "");
      document.head.appendChild(el);
      managed.push(el);
    }
    return () => managed.forEach((el) => el.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

// Inject the brand Google Fonts (Nunito + JetBrains Mono) once. Id-guarded so it
// is never duplicated across the public pages and survives lang toggles.
export function useBrandFonts() {
  useEffect(() => {
    const links = [
      ["pawpi-font-preconnect-1", { rel: "preconnect", href: "https://fonts.googleapis.com" }],
      [
        "pawpi-font-preconnect-2",
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "anonymous" },
      ],
      [
        "pawpi-font-css",
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;800&family=JetBrains+Mono:wght@400;500&display=swap",
        },
      ],
    ];
    for (const [id, attrs] of links) {
      if (document.getElementById(id)) continue;
      const el = document.createElement("link");
      el.id = id;
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      document.head.appendChild(el);
    }
  }, []);
}

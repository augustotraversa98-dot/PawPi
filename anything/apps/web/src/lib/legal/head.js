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

// Brand fonts (Nunito + JetBrains Mono) are SELF-HOSTED: the @font-face rules live in
// src/app/global.css and the woff2 files in public/fonts, so public pages make no request to Google
// Fonts (a visitor's IP never reaches a third party). Kept as a no-op so the page components that call
// it stay unchanged.
export function useBrandFonts() {}

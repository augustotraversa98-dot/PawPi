import * as React from "react";

// AUDIT A-04 — client side of the private medical/chat media path.
//
// Medical files (vet PDFs, health/stool/vomit photos) and chat attachments are
// uploaded with { visibility: "private", petId } (see useUpload) and PERSISTED as
// an object KEY of the form `pets/<petId>/<uuid>.<ext>` — NOT a URL. To display
// one, the app asks the auth-gated streamer for a short-lived signed URL:
//   GET /api/media?key=<key>&json=1  →  { url }
// (the app fetch wrapper attaches the JWT; the returned signed URL needs no auth,
// so a native <Image>/Linking can use it directly). Provider surfaces pass a
// providerId so a vet with a care grant can open the file.
//
// BACKWARD COMPATIBILITY: every render site already holds a plain public URL for
// existing rows. isPrivateMediaKey() distinguishes the two, and the resolver
// passes a URL straight through — so legacy public media keeps rendering with no
// round-trip while new private keys are streamed. This is what lets the private
// path ship before the bucket is privatised.

// A private key is exactly `pets/<positive int>/<name>` and, crucially, NOT a URL.
// Mirrors the server KEY_RE in utils/mediaAccess.js.
const KEY_RE = /^pets\/\d+\/[a-zA-Z0-9._-]+$/;

export function isPrivateMediaKey(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value.includes("://")) return false; // http(s):/data:/blob: URL → not a key
  if (value.includes("..") || value.startsWith("/")) return false;
  return KEY_RE.test(value);
}

// Resolve a stored value (private key OR legacy public URL OR local file uri) to
// a directly-displayable URL. Keys are exchanged for a signed URL via the
// streamer; anything else is returned unchanged. Returns null for empty input.
export async function resolvePrivateMediaUrl(value, { providerId } = {}) {
  if (!value) return null;
  if (!isPrivateMediaKey(value)) return value; // public URL / local uri — passthrough
  const qs = new URLSearchParams({ key: value, json: "1" });
  if (providerId != null) qs.set("providerId", String(providerId));
  const res = await fetch(`/api/media?${qs.toString()}`);
  if (!res.ok) {
    throw new Error(`media resolve failed: ${res.status}`);
  }
  const data = await res.json();
  if (!data?.url) throw new Error("media resolve: no url");
  return data.url;
}

// Hook form for render sites: give it the stored value, get back a displayable
// uri (null while resolving or on error). Public URLs resolve synchronously on
// the first render; private keys resolve after a round-trip. Re-resolves if the
// value or providerId changes.
export function usePrivateMediaUri(value, { providerId } = {}) {
  const initial = value && !isPrivateMediaKey(value) ? value : null;
  const [uri, setUri] = React.useState(initial);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!value) {
      setUri(null);
      setError(null);
      return;
    }
    if (!isPrivateMediaKey(value)) {
      setUri(value);
      setError(null);
      return;
    }
    setUri(null);
    setError(null);
    resolvePrivateMediaUrl(value, { providerId })
      .then((resolved) => {
        if (!cancelled) setUri(resolved);
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      });
    return () => {
      cancelled = true;
    };
  }, [value, providerId]);

  const loading = !!value && isPrivateMediaKey(value) && uri == null && !error;
  return { uri, loading, error };
}

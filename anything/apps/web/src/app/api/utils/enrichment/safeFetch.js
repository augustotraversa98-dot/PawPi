// enrichment/safeFetch — SSRF guard for the server-side document fetches (night-run S2 / #2).
//
// The enrichment extractors fetch a STORED file URL on the server (a vet document in petRecords, a
// provider price-list in document). That URL can be CLIENT-SUPPLIED — POST /api/vet-record/documents/
// extract accepts `body.url` verbatim — so without a guard an authenticated user could point it at an
// internal address (the cloud metadata endpoint 169.254.169.254, localhost, a private-range host) and
// have the backend fetch it (a blind SSRF, and the vet-record path can reflect fetched bytes back via
// the model proposal). This restricts those fetches to the app's own storage hosts over https, blocks
// IP-literal / private / loopback / link-local targets, and re-validates every redirect hop.
//
// The two callers already fail SOFT (a throw becomes an empty proposal), so a blocked URL degrades to
// "nothing extracted", never a 500 — the exact behaviour a malformed file already produces.

// Storage hosts the app actually serves uploaded files from. SUPABASE_URL's host (the `media` bucket,
// where /api/upload writes) is added at call time from the env; these are the other known stores
// (the legacy anything upload path + Uploadcare CDN). Extend via ENRICHMENT_FETCH_ALLOWED_HOSTS
// (comma-separated) without a code change if a new store is introduced.
const STATIC_ALLOWED_HOSTS = ["api.anything.com", "ucarecdn.com"];

export function allowedFetchHosts() {
  const hosts = new Set(STATIC_ALLOWED_HOSTS);
  const supabaseUrl = process.env.SUPABASE_URL;
  if (supabaseUrl) {
    try {
      hosts.add(new URL(supabaseUrl).hostname.toLowerCase());
    } catch {
      // ignore a malformed SUPABASE_URL — the static hosts still apply
    }
  }
  for (const raw of (process.env.ENRICHMENT_FETCH_ALLOWED_HOSTS || "").split(",")) {
    const host = raw.trim().toLowerCase();
    if (host) hosts.add(host);
  }
  return hosts;
}

// Is `hostname` a bare IP literal? Storage is always a domain, so an IP literal is never legitimate
// here — we reject them all (this also stops `http://169.254.169.254/...` etc. before the DNS-range
// check even matters).
function isIpLiteral(hostname) {
  const h = hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true; // IPv4 dotted-quad
  return h.includes(":"); // IPv6
}

// Belt-and-suspenders: even if an IP literal somehow slipped past the allowlist, refuse the private,
// loopback, link-local, and CGNAT ranges explicitly.
function isPrivateIpLiteral(hostname) {
  const h = hostname.replace(/^\[|\]$/g, "");
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local incl. AWS/GCP metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    return false;
  }
  const low = h.toLowerCase();
  if (low === "::1" || low === "::") return true;
  if (low.startsWith("fe80:")) return true; // link-local
  if (/^f[cd][0-9a-f]{2}:/.test(low)) return true; // ULA fc00::/7
  return false;
}

export class BlockedFetchUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = "BlockedFetchUrlError";
  }
}

// Validate a URL is safe to fetch server-side; returns the parsed URL or throws BlockedFetchUrlError.
export function assertAllowedFetchUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl));
  } catch {
    throw new BlockedFetchUrlError("invalid url");
  }
  if (url.protocol !== "https:") {
    throw new BlockedFetchUrlError(`protocol not allowed: ${url.protocol}`);
  }
  const host = url.hostname.toLowerCase();
  if (isIpLiteral(host) || isPrivateIpLiteral(host)) {
    throw new BlockedFetchUrlError("ip-literal host not allowed");
  }
  const allowed = allowedFetchHosts();
  const ok = [...allowed].some((a) => host === a || host.endsWith(`.${a}`));
  if (!ok) {
    throw new BlockedFetchUrlError(`host not allowed: ${host}`);
  }
  return url;
}

// A fetch that validates the target host, refuses to auto-follow redirects, and re-validates each
// redirect hop against the same allowlist before following it. Same call/return shape as fetch()
// for the callers that use res.ok / res.arrayBuffer(). Throws BlockedFetchUrlError for a disallowed
// target (initial or via a redirect), which the callers catch and turn into an empty proposal.
export async function safeFetch(rawUrl, init = {}, { maxRedirects = 3 } = {}) {
  let target = assertAllowedFetchUrl(rawUrl).toString();
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await fetch(target, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return res; // a redirect with no target — hand it back as-is
      const next = new URL(location, target); // resolve relative Location against the current URL
      target = assertAllowedFetchUrl(next.toString()).toString();
      continue;
    }
    return res;
  }
  throw new BlockedFetchUrlError("too many redirects");
}

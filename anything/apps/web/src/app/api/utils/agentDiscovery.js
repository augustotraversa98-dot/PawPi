// Agent discovery for the public website (the checks at isitagentready.com):
//   - RFC 8288 `Link` headers on the public pages;
//   - "Markdown for Agents": the same pages as text/markdown when the Accept header asks for it;
//   - three /.well-known JSON documents (RFC 9727 API catalog, Agent Skills index, ARD manifest).
//
// Only GET and HEAD are looked at, and only on those exact paths: everything else — /api/* above all —
// goes straight to the next handler untouched. Registered in __create/index.ts after blockProbePaths()
// and before the API routes / React Router handler.
//
// PUBLISH ONLY WHAT EXISTS. PawPi has no public third-party API, no OpenAPI document, no MCP server, no
// A2A agent and no agent skills; nothing here may claim otherwise.
//
// No cache headers on purpose: Cloudflare sits in front and these responses stay uncached (DYNAMIC).
import { MARKDOWN_PATHS, markdownPage } from "@/lib/agent/markdown";
import { SITE_URL } from "@/lib/brand/tokens";
import { langFromSearch } from "@/lib/legal/lang";

export const API_CATALOG_PATH = "/.well-known/api-catalog";
export const SKILLS_INDEX_PATH = "/.well-known/agent-skills/index.json";
export const AI_CATALOG_PATH = "/.well-known/ai-catalog.json";

// RFC 9727. The one endpoint meant to be called by anyone is the liveness probe. No service-desc (there
// is no OpenAPI document) and no service-doc (it has no documentation page). The token-based
// /api/public/emergency/* reads are deliberately absent: they serve whoever scans a dog's tag, and are
// not an API to be discovered.
export const API_CATALOG = {
  linkset: [
    {
      anchor: `${SITE_URL}/api/health/deep`,
      status: [{ href: `${SITE_URL}/api/health/deep`, type: "application/json" }],
    },
  ],
};

// Agent Skills Discovery RFC v0.2.0. PawPi publishes no agent skills.
export const SKILLS_INDEX = {
  $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  skills: [],
};

// ARD / ai-catalog manifest. Its single entry is the API catalog above.
export const AI_CATALOG = {
  specVersion: "1.0",
  host: { displayName: "PawPi", identifier: "pawpi.info" },
  entries: [
    {
      identifier: "urn:air:pawpi.info:api:catalog",
      displayName: "PawPi API catalog",
      type: "application/linkset+json",
      url: `${SITE_URL}${API_CATALOG_PATH}`,
      representativeQueries: [
        "which public API endpoints does PawPi publish",
        "is the PawPi service up",
        "where is the PawPi health status endpoint",
      ],
    },
  ],
};

const DOCUMENTS = new Map([
  [
    API_CATALOG_PATH,
    {
      type: "application/linkset+json",
      body: API_CATALOG,
      // RFC 9727: the catalog announces itself.
      link: `<${API_CATALOG_PATH}>; rel="api-catalog"`,
    },
  ],
  [SKILLS_INDEX_PATH, { type: "application/json", body: SKILLS_INDEX }],
  [AI_CATALOG_PATH, { type: "application/json", body: AI_CATALOG }],
]);

// Accept header -> [{ type, q }]. A missing q is 1; an unreadable or out-of-range one counts as 0.
function parseAccept(header) {
  return String(header || "")
    .split(",")
    .map((part) => {
      const [type, ...params] = part.split(";").map((s) => s.trim().toLowerCase());
      const weight = params.find((p) => p.startsWith("q="));
      let q = 1;
      if (weight) {
        const value = weight.slice(2).trim();
        q = value !== "" && Number(value) >= 0 && Number(value) <= 1 ? Number(value) : 0;
      }
      return { type, q };
    })
    .filter((range) => range.type);
}

// Markdown only when text/markdown is NAMED (a wildcard never selects it) with q > 0 and it ranks at
// least as high as HTML. On a tie with an explicit text/html, the one listed first wins.
export function prefersMarkdown(header) {
  const ranges = parseAccept(header);
  const find = (type) => ranges.find((r) => r.type === type);
  const markdown = find("text/markdown");
  if (!markdown || markdown.q <= 0) return false;
  const html = find("text/html");
  const htmlQ = (html ?? find("text/*") ?? find("*/*"))?.q ?? 0;
  if (markdown.q !== htmlQ) return markdown.q > htmlQ;
  return !html || ranges.indexOf(markdown) < ranges.indexOf(html);
}

// Only things that exist. `path` and the page links keep the request's language.
export function linkHeader(path, lang, { markdownAlternate = true } = {}) {
  const query = lang === "en" ? "?lang=en" : "";
  return [
    '</sitemap.xml>; rel="sitemap"; type="application/xml"',
    `</privacy${query}>; rel="privacy-policy"`,
    `</terms${query}>; rel="terms-of-service"`,
    `</support${query}>; rel="service-doc"`,
    `<${API_CATALOG_PATH}>; rel="api-catalog"; type="application/linkset+json"`,
    ...(markdownAlternate ? [`<${path}${query}>; rel="alternate"; type="text/markdown"`] : []),
  ].join(", ");
}

// The page path with any trailing slash removed, or null when the path has no markdown version.
function publicPage(pathname) {
  const path = pathname.replace(/(.)\/+$/, "$1");
  return MARKDOWN_PATHS.includes(path) ? path : null;
}

export function agentDiscovery() {
  return async (c, next) => {
    const method = c.req.method;
    if (method !== "GET" && method !== "HEAD") return next();

    const document = DOCUMENTS.get(c.req.path);
    if (document) {
      return c.body(JSON.stringify(document.body), 200, {
        "Content-Type": document.type,
        "Access-Control-Allow-Origin": "*",
        ...(document.link ? { Link: document.link } : {}),
      });
    }

    const path = publicPage(c.req.path);
    if (!path) return next();
    const lang = langFromSearch(new URL(c.req.url).search);

    if (prefersMarkdown(c.req.header("accept"))) {
      const markdown = markdownPage(path, lang);
      return c.body(markdown, 200, {
        "Content-Type": "text/markdown; charset=utf-8",
        // The usual estimate of four characters per token.
        "x-markdown-tokens": String(Math.ceil(markdown.length / 4)),
        Vary: "Accept",
        Link: linkHeader(path, lang, { markdownAlternate: false }),
      });
    }

    await next();
    c.header("Vary", "Accept", { append: true });
    c.header("Link", linkHeader(path, lang), { append: true });
  };
}

import ReactMarkdown from "react-markdown";
import { Link } from "react-router";
import { BRAND, FONT_SANS } from "@/lib/brand/tokens";

// Flatten a react-markdown children array to plain text (for heading anchor ids).
function textOf(children) {
  if (children == null) return "";
  if (typeof children === "string" || typeof children === "number")
    return String(children);
  if (Array.isArray(children)) return children.map(textOf).join("");
  if (children.props) return textOf(children.props.children);
  return "";
}

function slugify(children) {
  return textOf(children)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const link = {
  color: BRAND.brown,
  textDecoration: "underline",
  textUnderlineOffset: 2,
  fontWeight: 600,
};

// Branded long-form renderer for the ported legal/support markdown. Warm-brown
// text on cream, Nunito, comfortable measure. Links are underlined brown (never
// coral). Section headings (h2) get anchor ids for in-page navigation.
const components = {
  h1: ({ children }) => (
    <h1 style={{ fontSize: 30, fontWeight: 800, color: BRAND.brown, letterSpacing: "-0.02em", margin: "28px 0 12px" }}>
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2
      id={slugify(children)}
      style={{ fontSize: 22, fontWeight: 800, color: BRAND.brown, letterSpacing: "-0.01em", margin: "32px 0 10px", scrollMarginTop: 80 }}
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 style={{ fontSize: 17, fontWeight: 800, color: BRAND.brown, margin: "22px 0 8px" }}>
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p style={{ margin: "0 0 14px", lineHeight: 1.65 }}>{children}</p>
  ),
  ul: ({ children }) => (
    <ul style={{ margin: "0 0 16px", paddingLeft: 22, lineHeight: 1.65 }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ margin: "0 0 16px", paddingLeft: 22, lineHeight: 1.65 }}>{children}</ol>
  ),
  li: ({ children }) => <li style={{ margin: "4px 0" }}>{children}</li>,
  strong: ({ children }) => (
    <strong style={{ fontWeight: 800, color: BRAND.brown }}>{children}</strong>
  ),
  blockquote: ({ children }) => (
    <blockquote
      style={{
        margin: "0 0 18px",
        padding: "12px 16px",
        background: BRAND.sand,
        borderRadius: 12,
        color: BRAND.muted,
        fontSize: 14,
      }}
    >
      {children}
    </blockquote>
  ),
  hr: () => (
    <hr style={{ border: 0, borderTop: `1px solid ${BRAND.border}`, margin: "28px 0" }} />
  ),
  a: ({ href = "", children }) => {
    const isInternal = href.startsWith("/");
    if (isInternal) {
      return (
        <Link to={href} style={link}>
          {children}
        </Link>
      );
    }
    const isExternal = /^https?:\/\//.test(href);
    return (
      <a
        href={href}
        style={link}
        {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
      </a>
    );
  },
};

export default function LegalArticle({ content }) {
  return (
    <div style={{ color: BRAND.brown, fontFamily: FONT_SANS, fontSize: 16 }}>
      <ReactMarkdown components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

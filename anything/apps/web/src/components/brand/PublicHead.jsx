import {
  appleItunesAppContent,
  buildHomeJsonLd,
  buildHomeSocialMeta,
  isPublicPath,
} from "@/lib/home/meta";

// Server-rendered <head> tags for the public pages (rendered inside <head> by root.tsx): Safari's smart
// app banner everywhere public, plus social-preview tags and JSON-LD on the homepage.
export default function PublicHead({ pathname, search }) {
  if (!isPublicPath(pathname)) return null;
  const isHome = pathname === "/";

  return (
    <>
      <meta name="apple-itunes-app" content={appleItunesAppContent()} />
      {isHome
        ? buildHomeSocialMeta({ search }).map((tag) => (
            <meta key={tag.property || tag.name} {...tag} />
          ))
        : null}
      {isHome ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: buildHomeJsonLd({ search }) }}
        />
      ) : null}
    </>
  );
}

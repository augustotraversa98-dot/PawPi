import { useLang } from "@/lib/legal/useLang";
import { APP_STORE_BADGE_LABELS, appStoreUrl } from "@/lib/brand/tokens";

// Apple's official "Download on the App Store" badge: the black artwork from Apple's marketing tools
// (toolbox.marketingtools.apple.com), self-hosted in public/badges and used byte-for-byte — never
// recolour, crop, redraw or add effects. Spanish is Apple's Latin American (es-MX) badge, the variant
// the Argentine store uses. The alt text repeats the words printed on each badge.
//
// Apple's rules: at least 40px tall on screen, and clear space of a quarter of the height on every
// side — keep neighbours at least height/4 away.
const BADGE_FILES = {
  es: "/badges/app-store-es.svg",
  en: "/badges/app-store-en.svg",
};
const ASPECT = 119.66407 / 40; // both files share this viewBox
export const MIN_BADGE_HEIGHT = 40;

export default function AppStoreBadge({ height = 48 }) {
  const { lang } = useLang();
  const h = Math.max(height, MIN_BADGE_HEIGHT);

  return (
    <a
      href={appStoreUrl(lang)}
      className="pp-focus"
      style={{
        display: "inline-block",
        lineHeight: 0,
        borderRadius: Math.round(h * 0.17),
        flexShrink: 0,
      }}
    >
      <img
        src={BADGE_FILES[lang]}
        alt={APP_STORE_BADGE_LABELS[lang]}
        width={Math.round(h * ASPECT)}
        height={h}
        style={{ display: "block", height: h, width: "auto" }}
      />
    </a>
  );
}

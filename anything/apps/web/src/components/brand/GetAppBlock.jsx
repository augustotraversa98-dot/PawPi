import AppStoreBadge from "@/components/brand/AppStoreBadge";
import { BRAND } from "@/lib/brand/tokens";
import { useLang } from "@/lib/legal/useLang";

const TITLES = { es: "Descargá la app", en: "Get the app" };

// Small "Get the app" card (used on /support).
export default function GetAppBlock() {
  const { lang } = useLang();
  return (
    <aside
      aria-label={TITLES[lang]}
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        background: BRAND.card,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 20,
        padding: "16px 18px",
        margin: "0 0 24px",
      }}
    >
      <p style={{ margin: 0, fontSize: 17, fontWeight: 800, color: BRAND.brown }}>
        {TITLES[lang]}
      </p>
      <AppStoreBadge height={44} />
    </aside>
  );
}

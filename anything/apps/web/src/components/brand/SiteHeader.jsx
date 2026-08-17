import BrandLockup from "@/components/brand/BrandLockup";
import LangToggle from "@/components/brand/LangToggle";
import { BRAND } from "@/lib/brand/tokens";

// Shared top bar for the public pages: brand lockup (→ home) on the left, the
// ES/EN toggle on the right. Cream background, hairline bottom border.
export default function SiteHeader({ showLangToggle = true }) {
  return (
    <header
      style={{
        borderBottom: `1px solid ${BRAND.border}`,
        background: BRAND.cream,
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div
        style={{
          maxWidth: 880,
          margin: "0 auto",
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <BrandLockup markWidth={30} />
        {showLangToggle ? <LangToggle /> : null}
      </div>
    </header>
  );
}

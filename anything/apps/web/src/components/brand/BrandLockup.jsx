import { Link } from "react-router";
import PawMark from "@/components/brand/PawMark";
import { BRAND, FONT_SANS } from "@/lib/brand/tokens";

// The PawPi lockup: mark + "PawPi" wordmark typeset live in Nunito ExtraBold
// (the shipped SVG is mark-only). Gap = 0.35 × mark width, wordmark cap height
// ≈ 0.55 × mark height, letter-spacing -0.02em, warm brown — per brand §6.
export default function BrandLockup({ markWidth = 32, to = "/", color = BRAND.brown }) {
  const content = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: markWidth * 0.35,
        textDecoration: "none",
      }}
    >
      <PawMark width={markWidth} color={color} />
      <span
        style={{
          fontFamily: FONT_SANS,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          fontSize: markWidth * 0.85,
          color,
          lineHeight: 1,
        }}
      >
        PawPi
      </span>
    </span>
  );

  if (!to) return content;
  return (
    <Link to={to} aria-label="PawPi — home" style={{ textDecoration: "none" }}>
      {content}
    </Link>
  );
}

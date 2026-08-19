export const PAWPI = {
  coral: "#FF6F61", warmBrown: "#3B241B", cream: "#FFF7EF",
  card: "#FFFCF8", sand: "#F8EBDD", peach: "#FFD9B3",
  mutedBrown: "#7A6254", border: "#F0E0D0",
};

// X (clear space unit) = 0.25 * width. Wrap the mark, never pad it away.
export function PawMark({ size = 32, src = "/logo/pawpi-paws-brown.svg" }) {
  return (
    <span style={{ display: "inline-flex", padding: size * 0.25 }}>
      <img src={src} width={size} height={size * 0.947} alt="PawPi" />
    </span>
  );
}

export function PawLockup({ size = 32, color = PAWPI.warmBrown }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: size * 0.35 }}>
      <img src="/logo/pawpi-paws-brown.svg" width={size} height={size * 0.947} alt="" />
      <span style={{ fontFamily: "Nunito, sans-serif", fontWeight: 800,
                     fontSize: size * 0.75, letterSpacing: "-.02em", color }}>PawPi</span>
    </span>
  );
}

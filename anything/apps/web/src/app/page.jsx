import { useEffect } from "react";
import { useNavigate } from "react-router";
import useUser from "@/utils/useUser";
import { COLORS } from "@/app/provider/lib/colors";
import { resolveHomeView } from "@/app/resolveHomeView";

// Session-aware landing for the provider-facing web app. Logged-in visitors are
// redirected straight to /provider; logged-out visitors get the marketing landing.
export default function Page() {
  const navigate = useNavigate();
  const { user, loading } = useUser();
  const view = resolveHomeView({ loading, user });

  useEffect(() => {
    if (view === "redirect") {
      navigate("/provider");
    }
  }, [view, navigate]);

  // While loading, or when logged in (redirect in flight), render nothing so the
  // landing never flashes before the redirect.
  if (view !== "landing") return null;

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: COLORS.cream,
        padding: 24,
        textAlign: "center",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div style={{ maxWidth: 520, width: "100%" }}>
        <div style={{ fontSize: 64, lineHeight: 1, marginBottom: 16 }}>🐾</div>
        <h1
          style={{
            fontSize: 36,
            fontWeight: 800,
            color: COLORS.brown,
            margin: "0 0 12px",
          }}
        >
          PawPi for Business
        </h1>
        <p
          style={{
            fontSize: 17,
            color: COLORS.terracotta,
            margin: "0 0 32px",
            lineHeight: 1.5,
          }}
        >
          Manage your clinic, shop, daycare, or shelter — bookings, clients, and
          pet records, all in one place.
        </p>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            alignItems: "stretch",
          }}
        >
          <a
            href="/account/signin"
            style={{
              display: "block",
              padding: "14px 24px",
              borderRadius: 14,
              backgroundColor: COLORS.coral,
              color: "#fff",
              fontSize: 17,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Sign in
          </a>
          <a
            href="/account/signup"
            style={{
              display: "block",
              padding: "14px 24px",
              borderRadius: 14,
              backgroundColor: "transparent",
              color: COLORS.coral,
              border: `2px solid ${COLORS.peach}`,
              fontSize: 17,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Create an account
          </a>
        </div>
      </div>
    </div>
  );
}

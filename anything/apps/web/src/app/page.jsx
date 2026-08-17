import { useEffect } from "react";
import { useNavigate } from "react-router";
import useUser from "@/utils/useUser";
import { resolveHomeView } from "@/app/resolveHomeView";
import HomePage from "@/components/home/HomePage";

// Session-aware landing for the web app. Logged-in visitors are redirected to
// /provider; logged-out visitors get the branded public homepage (WEB1 PR2).
// The redirect contract (resolveHomeView) is unchanged from the old landing.
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
  // homepage never flashes before the redirect.
  if (view !== "landing") return null;

  return <HomePage />;
}

import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Loader2 } from "lucide-react";
import useUser from "@/utils/useUser";
import { getProviderQueryClient } from "../lib/queryClient";
import { COLORS } from "../lib/colors";
import ProviderInvites from "../components/ProviderInvites";

// /provider/invites — the staff-accept surface. CRITICAL: this page must NOT sit
// behind ProviderShell's active-provider gate. An invited user has NO active
// provider yet (that's the whole point), so we gate on a logged-in SESSION only —
// not on provider membership — and render the invites list directly. Accepting an
// invite makes the user active staff; ProviderInvites then routes into the now-
// resolvable dashboard.
function InvitesGate() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useUser();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/account/signin");
    }
  }, [authLoading, user, navigate]);

  if (authLoading || !user) {
    return (
      <div
        className="flex min-h-screen w-full items-center justify-center p-6"
        style={{ backgroundColor: COLORS.cream }}
      >
        <Loader2
          className="h-7 w-7 animate-spin"
          style={{ color: COLORS.coral }}
        />
      </div>
    );
  }

  return <ProviderInvites />;
}

export default function ProviderInvitesPage() {
  return (
    <QueryClientProvider client={getProviderQueryClient()}>
      <InvitesGate />
    </QueryClientProvider>
  );
}

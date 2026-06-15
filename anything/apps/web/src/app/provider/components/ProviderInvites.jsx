import { useNavigate } from "react-router";
import { MailCheck, Check, X, Loader2, Building2 } from "lucide-react";
import { toast } from "sonner";
import {
  useMyProviderInvites,
  useRespondToInvite,
} from "../hooks/useProviders";
import { COLORS } from "../lib/colors";

// Pending provider invitations for the logged-in user (the staff-accept surface,
// closing the c2c gap). Deliberately NOT behind the active-provider gate: an
// invited user has no active provider yet, so this renders on a session alone.
// Accepting flips the invite to active staff (the shell then resolves that
// provider) and routes into the dashboard; declining soft-removes it.

const ROLE_BADGE = {
  owner: { bg: "#FFF1E2", fg: "#B75D32" },
  admin: { bg: "#E7EEFB", fg: "#3A5BB0" },
  staff: { bg: "#EFEAE6", fg: "#7A6254" },
  vet: { bg: "#E5F4EC", fg: "#1F7A4D" },
};

function RoleBadge({ role }) {
  const s = ROLE_BADGE[role] || ROLE_BADGE.staff;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {role || "—"}
    </span>
  );
}

function InviteLogo({ invite }) {
  if (invite.logo_url) {
    return (
      <img
        src={invite.logo_url}
        alt=""
        className="h-11 w-11 flex-shrink-0 rounded-xl object-cover"
      />
    );
  }
  return (
    <div
      className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
      style={{ backgroundColor: COLORS.peach }}
    >
      <Building2 className="h-5 w-5" style={{ color: COLORS.terracotta }} />
    </div>
  );
}

export default function ProviderInvites() {
  const navigate = useNavigate();
  const { data: invites, isLoading, isError, error } = useMyProviderInvites();
  const respond = useRespondToInvite();

  const onAccept = (invite) => {
    respond.mutate(
      { providerId: invite.provider_id },
      {
        onSuccess: () => {
          toast.success(`You've joined ${invite.provider_name || "the team"}`);
          // The provider is now resolvable by the shell — land on the dashboard.
          navigate("/provider/bookings");
        },
        onError: (err) =>
          toast.error(err?.message || "Couldn't accept the invitation"),
      },
    );
  };

  const onDecline = (invite) => {
    respond.mutate(
      { providerId: invite.provider_id, action: "decline" },
      {
        onSuccess: () => toast.success("Invitation declined"),
        onError: (err) =>
          toast.error(err?.message || "Couldn't decline the invitation"),
      },
    );
  };

  // Which invite (if any) currently has a request in flight — disables its row.
  const pendingProviderId = respond.isPending
    ? respond.variables?.providerId
    : null;

  return (
    <div
      className="flex min-h-screen w-full justify-center"
      style={{ backgroundColor: COLORS.cream }}
    >
      <div className="w-full max-w-2xl px-6 py-10">
        <div className="mb-6 flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: COLORS.peach }}
          >
            <MailCheck className="h-5 w-5" style={{ color: COLORS.terracotta }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#3B241B]">
              Pending invitations
            </h1>
            <p className="text-sm text-[#7A6254]">
              Providers that invited you to join their team
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#FFD9B3] bg-white">
          {isLoading ? (
            <div className="flex items-center justify-center gap-3 px-6 py-16 text-[#7A6254]">
              <Loader2
                className="h-5 w-5 animate-spin"
                style={{ color: COLORS.coral }}
              />
              Loading invitations…
            </div>
          ) : isError ? (
            <div className="px-6 py-16 text-center">
              <p className="font-semibold text-[#B23B30]">
                Couldn't load invitations
              </p>
              <p className="mt-1 text-sm text-[#7A6254]">
                {error?.message || "Please try again."}
              </p>
            </div>
          ) : (invites ?? []).length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-base font-semibold text-[#3B241B]">
                No pending invitations
              </p>
              <p className="mt-1 text-sm text-[#7A6254]">
                When a provider invites you to their team, it'll show up here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[#FFF7EF]">
              {invites.map((invite) => {
                const busy = pendingProviderId === invite.provider_id;
                return (
                  <li
                    key={invite.id}
                    className="flex flex-wrap items-center gap-4 px-5 py-4"
                  >
                    <InviteLogo invite={invite} />
                    <div className="min-w-[160px] flex-1">
                      <div className="font-semibold text-[#3B241B]">
                        {invite.provider_name || "Unnamed provider"}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-[#7A6254]">
                        {invite.provider_type && (
                          <span className="capitalize">
                            {invite.provider_type}
                          </span>
                        )}
                        <span>·</span>
                        <span>invited as</span>
                        <RoleBadge role={invite.role} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onAccept(invite)}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white transition-opacity disabled:opacity-60"
                        style={{ backgroundColor: COLORS.coral }}
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => onDecline(invite)}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60"
                        style={{
                          backgroundColor: "#FBE6E4",
                          color: "#B23B30",
                          borderColor: "#F3C9C4",
                        }}
                      >
                        <X className="h-4 w-4" />
                        Decline
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

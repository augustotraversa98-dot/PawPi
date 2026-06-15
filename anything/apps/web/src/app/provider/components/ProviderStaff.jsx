import { useForm } from "react-hook-form";
import {
  Users,
  UserPlus,
  ShieldCheck,
  Trash2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  useProviderStaff,
  useInviteStaff,
  useUpdateStaffRole,
  useRemoveStaff,
} from "../hooks/useProviders";
import { COLORS } from "../lib/colors";

// Staff management (c2c). Owner/admin can see the provider's staff (JOINED to
// user_profiles for names via the dedicated staff GET), invite an existing user
// by username, change a member's role, and remove a member. The owner row is
// clearly marked and protected — no role/remove controls (the backend rejects
// both anyway). Loaded inside the shell, so providerId is always set.

// Roles an invite or role-change may assign — 'owner' is never assignable here
// (set only at provider creation; no ownership transfer in the MVP).
const ASSIGNABLE_ROLES = ["admin", "staff", "vet"];

// Active first, then invited, then removed (dimmed) — within a status, owner
// floats to the top so it always reads as the anchor of the org.
const STATUS_ORDER = { active: 0, invited: 1, removed: 2 };

function displayName(m) {
  return m.full_name || m.username || `User #${m.user_profile_id}`;
}

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
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold capitalize"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {role === "owner" && <ShieldCheck className="h-3.5 w-3.5" />}
      {role || "—"}
    </span>
  );
}

const STATUS_BADGE = {
  active: { bg: "#E5F4EC", fg: "#1F7A4D", label: "Active" },
  invited: { bg: "#FFF1E2", fg: "#B75D32", label: "Invited" },
  removed: { bg: "#EFEAE6", fg: "#7A6254", label: "Removed" },
};

function StatusBadge({ status }) {
  const s = STATUS_BADGE[status] || {
    bg: "#EFEAE6",
    fg: "#7A6254",
    label: status || "—",
  };
  return (
    <span
      className="inline-block rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

export default function ProviderStaff({ providerId }) {
  const { data: staff, isLoading, isError, error } =
    useProviderStaff(providerId);

  const invite = useInviteStaff(providerId);
  const updateRole = useUpdateStaffRole(providerId);
  const remove = useRemoveStaff(providerId);

  const onChangeRole = (m, role) => {
    if (role === m.role) return;
    updateRole.mutate(
      { userProfileId: m.user_profile_id, role },
      {
        onSuccess: () => toast.success("Role updated"),
        onError: (err) => toast.error(err?.message || "Couldn't change role"),
      },
    );
  };

  const onRemove = (m) => {
    if (
      window.confirm(
        `Remove ${displayName(m)} from your team? They'll lose access; you can re-invite them later.`,
      )
    ) {
      remove.mutate(m.user_profile_id, {
        onSuccess: () => toast.success("Member removed"),
        onError: (err) => toast.error(err?.message || "Couldn't remove member"),
      });
    }
  };

  const list = [...(staff ?? [])].sort((a, b) => {
    const sa = STATUS_ORDER[a.status] ?? 3;
    const sb = STATUS_ORDER[b.status] ?? 3;
    if (sa !== sb) return sa - sb;
    // owner anchors the top of its status group.
    if (a.role === "owner") return -1;
    if (b.role === "owner") return 1;
    return 0;
  });

  return (
    <div className="px-8 py-7">
      <div className="mb-6 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: COLORS.peach }}
        >
          <Users className="h-5 w-5" style={{ color: COLORS.terracotta }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#3B241B]">Staff</h1>
          <p className="text-sm text-[#7A6254]">
            Who can manage this provider and handle bookings
          </p>
        </div>
      </div>

      <InviteForm invite={invite} />

      <div className="overflow-hidden rounded-2xl border border-[#FFD9B3] bg-white">
        {isLoading ? (
          <div className="flex items-center justify-center gap-3 px-6 py-16 text-[#7A6254]">
            <Loader2
              className="h-5 w-5 animate-spin"
              style={{ color: COLORS.coral }}
            />
            Loading staff…
          </div>
        ) : isError ? (
          <div className="px-6 py-16 text-center">
            <p className="font-semibold text-[#B23B30]">Couldn't load staff</p>
            <p className="mt-1 text-sm text-[#7A6254]">
              {error?.message || "Please try again."}
            </p>
          </div>
        ) : list.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-base font-semibold text-[#3B241B]">
              No staff yet
            </p>
            <p className="mt-1 text-sm text-[#7A6254]">
              Invite a teammate by username to help manage this provider.
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#FFF1E2] bg-[#FFFBF6]">
                {["Member", "Role", "Status", "Actions"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-[#7A6254]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((m) => {
                const isOwner = m.role === "owner";
                const dimmed = m.status === "removed";
                const busy =
                  (updateRole.isPending &&
                    updateRole.variables?.userProfileId === m.user_profile_id) ||
                  (remove.isPending && remove.variables === m.user_profile_id);
                return (
                  <tr
                    key={m.id}
                    className={`border-b border-[#FFF7EF] last:border-0 hover:bg-[#FFFBF6] ${
                      dimmed ? "opacity-60" : ""
                    }`}
                  >
                    <td className="px-4 py-3 align-middle">
                      <div className="font-semibold text-[#3B241B]">
                        {displayName(m)}
                      </div>
                      {m.username && (
                        <div className="mt-0.5 text-xs text-[#7A6254]">
                          @{m.username}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <RoleBadge role={m.role} />
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {isOwner ? (
                        <span className="text-xs text-[#B8A99D]">
                          Owner — protected
                        </span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="sr-only" htmlFor={`role-${m.id}`}>
                            Change role for {displayName(m)}
                          </label>
                          <select
                            id={`role-${m.id}`}
                            aria-label={`Change role for ${displayName(m)}`}
                            value={m.role}
                            disabled={busy}
                            onChange={(e) => onChangeRole(m, e.target.value)}
                            className="rounded-lg border-2 border-[#FFD9B3] bg-[#FFF7EF] px-2.5 py-1.5 text-xs font-semibold capitalize text-[#3B241B] outline-none focus:border-[#FF6F61] disabled:opacity-50"
                          >
                            {ASSIGNABLE_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => onRemove(m)}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
                            style={{
                              backgroundColor: "#FBE6E4",
                              color: "#B23B30",
                              borderColor: "#F3C9C4",
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-3 py-2.5 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]";

// Invite an existing user by username + role. The username is resolved server-
// side (404 if unknown); a previously-removed user is re-invited just by entering
// their username again (the backend flips removed→invited), so no special UI.
function InviteForm({ invite }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ defaultValues: { username: "", role: "staff" } });

  const submit = (values) => {
    const username = values.username.trim().replace(/^@/, "");
    invite.mutate(
      { username, role: values.role },
      {
        onSuccess: () => {
          toast.success("Invitation sent");
          reset({ username: "", role: "staff" });
        },
        onError: (err) => toast.error(err?.message || "Couldn't send invite"),
      },
    );
  };

  return (
    <div className="mb-6 rounded-2xl border border-[#FFD9B3] bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <UserPlus className="h-4 w-4" style={{ color: COLORS.terracotta }} />
        <h2 className="text-sm font-bold text-[#3B241B]">Invite a teammate</h2>
      </div>
      <form
        onSubmit={handleSubmit(submit)}
        className="flex flex-wrap items-start gap-3"
      >
        <div className="min-w-[200px] flex-1">
          <label className="sr-only" htmlFor="invite-username">
            Username
          </label>
          <input
            id="invite-username"
            type="text"
            placeholder="@username"
            {...register("username", {
              required: "Username is required",
              validate: (v) =>
                v.trim().replace(/^@/, "").length > 0 || "Username is required",
            })}
            className={inputCls}
          />
          {errors.username && (
            <p className="mt-1 text-xs font-semibold text-[#B23B30]">
              {errors.username.message}
            </p>
          )}
        </div>
        <div>
          <label className="sr-only" htmlFor="invite-role">
            Role
          </label>
          <select
            id="invite-role"
            aria-label="Invite role"
            {...register("role")}
            className="rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-3 py-2.5 text-sm font-semibold capitalize text-[#3B241B] outline-none focus:border-[#FF6F61]"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={invite.isPending}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-60"
          style={{ backgroundColor: COLORS.coral }}
        >
          {invite.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="h-4 w-4" />
          )}
          Invite
        </button>
      </form>
      <p className="mt-2 text-xs text-[#B8A99D]">
        Re-inviting someone you removed? Just enter their username again.
      </p>
    </div>
  );
}

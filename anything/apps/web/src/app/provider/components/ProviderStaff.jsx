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
import staffCopy from "../i18n/staff";
import { useProviderCopy } from "../i18n/lib/useProviderCopy";
import { fill } from "../i18n/lib/format";
import { roleName } from "../i18n/lib/labels";
import { serverErrorMessage } from "../i18n/lib/serverError";

// Staff management (c2c). Owner/admin can see the provider's staff (JOINED to
// user_profiles for names via the dedicated staff GET), invite an existing user
// by username, change a member's role, and remove a member. The owner row is
// clearly marked and protected — no role/remove controls (the backend rejects
// both anyway). Loaded inside the shell, so providerId is always set.

// Roles an invite or role-change may assign — 'owner' is never assignable here
// (set only at provider creation; no ownership transfer in the MVP).
const ASSIGNABLE_ROLES = ["admin", "staff", "vet"];

const COLUMNS = ["member", "role", "status", "actions"];

// Active first, then invited, then removed (dimmed) — within a status, owner
// floats to the top so it always reads as the anchor of the org.
const STATUS_ORDER = { active: 0, invited: 1, removed: 2 };

function displayName(m, t) {
  return (
    m.full_name || m.username || fill(t.userFallback, { id: m.user_profile_id })
  );
}

const ROLE_BADGE = {
  owner: { bg: "#FFF1E2", fg: "#B75D32" },
  admin: { bg: "#E7EEFB", fg: "#3A5BB0" },
  staff: { bg: "#EFEAE6", fg: "#7A6254" },
  vet: { bg: "#E5F4EC", fg: "#1F7A4D" },
};

function RoleBadge({ role }) {
  const { lang } = useProviderCopy(staffCopy);
  const s = ROLE_BADGE[role] || ROLE_BADGE.staff;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold${
        lang === "en" ? " capitalize" : ""
      }`}
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {role === "owner" && <ShieldCheck className="h-3.5 w-3.5" />}
      {role ? roleName(role, lang) : "—"}
    </span>
  );
}

const STATUS_BADGE = {
  active: { bg: "#E5F4EC", fg: "#1F7A4D" },
  invited: { bg: "#FFF1E2", fg: "#B75D32" },
  removed: { bg: "#EFEAE6", fg: "#7A6254" },
};

function StatusBadge({ status }) {
  const { t } = useProviderCopy(staffCopy);
  const s = STATUS_BADGE[status] || { bg: "#EFEAE6", fg: "#7A6254" };
  const label = Object.hasOwn(t.status, status) ? t.status[status] : status || "—";
  return (
    <span
      className="inline-block rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {label}
    </span>
  );
}

export default function ProviderStaff({ providerId }) {
  const { t, lang } = useProviderCopy(staffCopy);
  const errorText = (err, fallback) =>
    serverErrorMessage(err, lang, fallback, staffCopy);
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
        onSuccess: () => toast.success(t.roleUpdated),
        onError: (err) => toast.error(errorText(err, t.roleFailed)),
      },
    );
  };

  const onRemove = (m) => {
    const question = fill(t.confirmRemove, { name: displayName(m, t) });
    if (window.confirm(question)) {
      remove.mutate(m.user_profile_id, {
        onSuccess: () => toast.success(t.removed),
        onError: (err) => toast.error(errorText(err, t.removeFailed)),
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
          <h1 className="text-2xl font-bold text-[#3B241B]">{t.title}</h1>
          <p className="text-sm text-[#7A6254]">{t.subtitle}</p>
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
            {t.loading}
          </div>
        ) : isError ? (
          <div className="px-6 py-16 text-center">
            <p className="font-semibold text-[#B23B30]">{t.loadError}</p>
            <p className="mt-1 text-sm text-[#7A6254]">
              {errorText(error, t.tryAgain)}
            </p>
          </div>
        ) : list.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-base font-semibold text-[#3B241B]">
              {t.emptyTitle}
            </p>
            <p className="mt-1 text-sm text-[#7A6254]">{t.emptyBody}</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#FFF1E2] bg-[#FFFBF6]">
                {COLUMNS.map((column) => (
                  <th
                    key={column}
                    className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-[#7A6254]"
                  >
                    {t.columns[column]}
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
                        {displayName(m, t)}
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
                          {t.ownerProtected}
                        </span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="sr-only" htmlFor={`role-${m.id}`}>
                            {fill(t.changeRoleFor, { name: displayName(m, t) })}
                          </label>
                          <select
                            id={`role-${m.id}`}
                            aria-label={fill(t.changeRoleFor, {
                              name: displayName(m, t),
                            })}
                            value={m.role}
                            disabled={busy}
                            onChange={(e) => onChangeRole(m, e.target.value)}
                            className={`rounded-lg border-2 border-[#FFD9B3] bg-[#FFF7EF] px-2.5 py-1.5 text-xs font-semibold text-[#3B241B] outline-none focus:border-[#FF6F61] disabled:opacity-50${
                              lang === "en" ? " capitalize" : ""
                            }`}
                          >
                            {ASSIGNABLE_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {roleName(r, lang)}
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
                            {t.remove}
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
  const { t, lang } = useProviderCopy(staffCopy);
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
          toast.success(t.invite.sent);
          reset({ username: "", role: "staff" });
        },
        onError: (err) =>
          toast.error(serverErrorMessage(err, lang, t.invite.failed, staffCopy)),
      },
    );
  };

  return (
    <div className="mb-6 rounded-2xl border border-[#FFD9B3] bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <UserPlus className="h-4 w-4" style={{ color: COLORS.terracotta }} />
        <h2 className="text-sm font-bold text-[#3B241B]">{t.invite.title}</h2>
      </div>
      <form
        onSubmit={handleSubmit(submit)}
        className="flex flex-wrap items-start gap-3"
      >
        <div className="min-w-[200px] flex-1">
          <label className="sr-only" htmlFor="invite-username">
            {t.invite.username}
          </label>
          <input
            id="invite-username"
            type="text"
            placeholder={t.invite.usernamePlaceholder}
            // Messages are dictionary keys, looked up at render.
            {...register("username", {
              required: "usernameRequired",
              validate: (v) =>
                v.trim().replace(/^@/, "").length > 0 || "usernameRequired",
            })}
            className={inputCls}
          />
          {errors.username && (
            <p className="mt-1 text-xs font-semibold text-[#B23B30]">
              {t.rules[errors.username.message]}
            </p>
          )}
        </div>
        <div>
          <label className="sr-only" htmlFor="invite-role">
            {t.invite.role}
          </label>
          <select
            id="invite-role"
            aria-label={t.invite.roleAria}
            {...register("role")}
            className={`rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-3 py-2.5 text-sm font-semibold text-[#3B241B] outline-none focus:border-[#FF6F61]${
              lang === "en" ? " capitalize" : ""
            }`}
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {roleName(r, lang)}
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
          {t.invite.button}
        </button>
      </form>
      <p className="mt-2 text-xs text-[#B8A99D]">
        {t.invite.hint}
      </p>
    </div>
  );
}

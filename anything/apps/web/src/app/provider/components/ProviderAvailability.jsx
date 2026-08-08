import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Clock, Plus, Pencil, Trash2, Loader2, X, Info } from "lucide-react";
import { toast } from "sonner";
import {
  useProvider,
  useUpdateProviderProfile,
  useAvailabilityWindows,
  useCreateAvailabilityWindow,
  useUpdateAvailabilityWindow,
  useDeleteAvailabilityWindow,
} from "../hooks/useProviders";
import { COLORS } from "../lib/colors";
import { WEEKDAYS } from "../lib/hours";

// Availability (Hours) editor. Sets the working hours + slot length + time zone that feed the
// slot engine, replacing the seeded Mon–Fri 09:00–18:00 defaults (0076). MVP scope: PROVIDER-WIDE
// windows only — per-staff / per-capability / per-location windows are surfaced as a note (not
// hidden) but edited elsewhere. Loaded inside the shell, so providerId is always resolved.

// The slot lengths the editor offers (minutes). The backend accepts any positive value up to a
// day; these are the sane presets.
const SLOT_CHOICES = [15, 30, 60];

// 'HH:MM:SS' | 'HH:MM' → 'HH:MM' for the native time input; blank stays blank.
function toHHMM(t) {
  return t ? String(t).slice(0, 5) : "";
}

// A curated, ordered short list of zones for the launch markets, always merged with whatever the
// platform exposes and the provider's own current zone — so the select is never missing the
// value it needs to display.
const COMMON_ZONES = [
  "America/Argentina/Buenos_Aires",
  "America/Montevideo",
  "America/Santiago",
  "America/Sao_Paulo",
  "America/Bogota",
  "America/Mexico_City",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/Madrid",
  "Europe/London",
  "UTC",
];

function useTimeZoneOptions(current) {
  return useMemo(() => {
    let all = [];
    try {
      if (typeof Intl.supportedValuesOf === "function") {
        all = Intl.supportedValuesOf("timeZone");
      }
    } catch {
      all = [];
    }
    const merged = new Set([
      ...COMMON_ZONES,
      ...all,
      ...(current ? [current] : []),
    ]);
    return Array.from(merged);
  }, [current]);
}

export default function ProviderAvailability({ providerId }) {
  const { data: providerData } = useProvider(providerId);
  const currentZone = providerData?.provider?.time_zone ?? "";

  const { data, isLoading, isError, error } = useAvailabilityWindows(providerId);
  const windows = data?.windows ?? [];
  const scopedCount = data?.scoped_count ?? 0;

  const updateProfile = useUpdateProviderProfile(providerId);
  const create = useCreateAvailabilityWindow(providerId);
  const update = useUpdateAvailabilityWindow(providerId);
  const del = useDeleteAvailabilityWindow(providerId);

  const zoneOptions = useTimeZoneOptions(currentZone);

  // null = closed; { weekday } = add for that day; { ...window } = edit.
  const [editing, setEditing] = useState(null);

  const onZoneChange = (time_zone) => {
    if (!time_zone || time_zone === currentZone) return;
    updateProfile.mutate(
      { time_zone },
      {
        onSuccess: () => toast.success("Time zone saved"),
        onError: (err) => toast.error(err?.message || "Couldn't save time zone"),
      },
    );
  };

  const onSubmit = (body) => {
    if (editing?.id != null) {
      update.mutate(
        { availabilityId: editing.id, ...body },
        {
          onSuccess: () => {
            toast.success("Hours updated");
            setEditing(null);
          },
          onError: (err) => toast.error(err?.message || "Couldn't save hours"),
        },
      );
    } else {
      create.mutate(body, {
        onSuccess: () => {
          toast.success("Hours added");
          setEditing(null);
        },
        onError: (err) => toast.error(err?.message || "Couldn't add hours"),
      });
    }
  };

  const onDelete = (w) => {
    if (
      window.confirm(
        `Delete these hours (${toHHMM(w.start_time)}–${toHHMM(w.end_time)})? This cannot be undone.`,
      )
    ) {
      del.mutate(w.id, {
        onSuccess: () => toast.success("Hours deleted"),
        onError: (err) => toast.error(err?.message || "Couldn't delete hours"),
      });
    }
  };

  // Group windows by weekday (0=Mon..6=Sun) so each day lists only its own windows.
  const byDay = useMemo(() => {
    const map = {};
    for (const w of windows) {
      (map[w.weekday] ??= []).push(w);
    }
    return map;
  }, [windows]);

  const saving = create.isPending || update.isPending;

  return (
    <div className="px-8 py-7">
      <div className="mb-6 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: COLORS.peach }}
        >
          <Clock className="h-5 w-5" style={{ color: COLORS.terracotta }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#3B241B]">Availability</h1>
          <p className="text-sm text-[#7A6254]">
            Your bookable hours and slot length — this is what owners see when they book
          </p>
        </div>
      </div>

      {/* Time zone */}
      <div className="mb-6 rounded-2xl border border-[#FFD9B3] bg-white p-5">
        <label
          htmlFor="availability-timezone"
          className="mb-1 block text-sm font-semibold text-[#3B241B]"
        >
          Time zone
        </label>
        <p className="mb-3 text-xs text-[#7A6254]">
          Your hours below are in this zone. Owners see slots in the same local time.
        </p>
        <select
          id="availability-timezone"
          aria-label="Time zone"
          value={currentZone}
          onChange={(e) => onZoneChange(e.target.value)}
          disabled={updateProfile.isPending || !currentZone}
          className="w-full max-w-md rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-3 py-2.5 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61] disabled:opacity-60"
        >
          {zoneOptions.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </div>

      {scopedCount > 0 && (
        <div className="mb-6 flex items-start gap-2 rounded-2xl border border-[#FFD9B3] bg-[#FFF7EF] px-4 py-3 text-sm text-[#7A6254]">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#B75D32]" />
          <span>
            This provider also has {scopedCount} per-staff, per-service, or per-location{" "}
            {scopedCount === 1 ? "window" : "windows"} that aren't shown here. Editing those
            isn't supported yet — the hours below are the provider-wide schedule.
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-[#FFD9B3] bg-white px-6 py-16 text-[#7A6254]">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: COLORS.coral }} />
          Loading hours…
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-[#FFD9B3] bg-white px-6 py-16 text-center">
          <p className="font-semibold text-[#B23B30]">Couldn't load hours</p>
          <p className="mt-1 text-sm text-[#7A6254]">
            {error?.message || "Please try again."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {WEEKDAYS.map((day, weekday) => {
            const dayWindows = byDay[weekday] ?? [];
            return (
              <div
                key={day.key}
                className="rounded-2xl border border-[#FFD9B3] bg-white p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="w-24 text-sm font-bold text-[#3B241B]">
                    {day.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditing({ weekday })}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold"
                    style={{
                      backgroundColor: "#FFF7EF",
                      color: "#7A6254",
                      borderColor: "#FFD9B3",
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add hours
                  </button>
                </div>

                {dayWindows.length === 0 ? (
                  <p className="mt-2 text-sm text-[#B8A99D]">Closed</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {dayWindows.map((w) => {
                      const busy = del.isPending && del.variables === w.id;
                      return (
                        <li
                          key={w.id}
                          className="flex items-center justify-between gap-3 rounded-xl bg-[#FFF7EF] px-3 py-2"
                        >
                          <span
                            className={`text-sm ${w.active ? "text-[#3B241B]" : "text-[#B8A99D] line-through"}`}
                          >
                            {toHHMM(w.start_time)} – {toHHMM(w.end_time)}
                            <span className="ml-2 text-xs text-[#7A6254]">
                              {w.slot_minutes} min slots
                            </span>
                            {!w.active && (
                              <span className="ml-2 text-xs font-semibold text-[#B75D32]">
                                Off
                              </span>
                            )}
                          </span>
                          <div className="flex flex-shrink-0 items-center gap-2">
                            <RowButton
                              label="Edit"
                              Icon={Pencil}
                              onClick={() => setEditing(w)}
                              disabled={busy}
                              variant="muted"
                            />
                            <RowButton
                              label="Delete"
                              Icon={Trash2}
                              onClick={() => onDelete(w)}
                              disabled={busy}
                              variant="danger"
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <WindowFormModal
          window={editing.id != null ? editing : null}
          weekday={editing.weekday}
          onClose={() => setEditing(null)}
          onSubmit={onSubmit}
          saving={saving}
        />
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-3 py-2.5 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]";

// Add / edit one window. weekday, start/end (native time inputs), slot length, and an enabled
// toggle. Client-side guards start<end before any request (mirrors the server 400).
function WindowFormModal({ window: win, weekday, onClose, onSubmit, saving }) {
  const isEdit = win != null;
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm({
    defaultValues: {
      weekday: 0,
      start_time: "09:00",
      end_time: "18:00",
      slot_minutes: 30,
      active: true,
    },
  });

  useEffect(() => {
    reset({
      weekday: win ? win.weekday : (weekday ?? 0),
      start_time: win ? toHHMM(win.start_time) : "09:00",
      end_time: win ? toHHMM(win.end_time) : "18:00",
      slot_minutes: win ? win.slot_minutes : 30,
      active: win ? win.active : true,
    });
  }, [win, weekday, reset]);

  const submit = (values) => {
    if (!(values.start_time < values.end_time)) {
      setError("end_time", {
        type: "validate",
        message: "End time must be after start time",
      });
      return;
    }
    onSubmit({
      weekday: Number(values.weekday),
      start_time: values.start_time,
      end_time: values.end_time,
      slot_minutes: Number(values.slot_minutes),
      active: Boolean(values.active),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Edit hours" : "Add hours"}
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#3B241B]">
            {isEdit ? "Edit hours" : "Add hours"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-[#7A6254] hover:bg-[#FFF7EF]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <Field label="Day">
            <select
              aria-label="Day"
              {...register("weekday")}
              className={inputCls}
            >
              {WEEKDAYS.map((day, i) => (
                <option key={day.key} value={i}>
                  {day.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">
              <input
                type="time"
                aria-label="Start time"
                {...register("start_time")}
                className={inputCls}
              />
            </Field>
            <Field label="End" error={errors.end_time?.message}>
              <input
                type="time"
                aria-label="End time"
                {...register("end_time")}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Slot length">
            <select
              aria-label="Slot length"
              {...register("slot_minutes")}
              className={inputCls}
            >
              {SLOT_CHOICES.map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </Field>

          <label className="flex items-center gap-2 text-sm font-semibold text-[#3B241B]">
            <input type="checkbox" {...register("active")} />
            Enabled (owners can book these hours)
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-4 py-2.5 text-sm font-bold text-[#7A6254]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: COLORS.coral }}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Save changes" : "Add hours"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RowButton({ label, Icon, onClick, disabled, variant }) {
  const styles = {
    danger: { backgroundColor: "#FBE6E4", color: "#B23B30", border: "#F3C9C4" },
    muted: { backgroundColor: "#FFF7EF", color: "#7A6254", border: "#FFD9B3" },
  }[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
      style={{
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        borderColor: styles.border,
      }}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function Field({ label, error, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-[#3B241B]">
        {label}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-xs font-semibold text-[#B23B30]">{error}</p>
      )}
    </div>
  );
}

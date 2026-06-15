import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  MapPin,
  Plus,
  Pencil,
  Trash2,
  Clock,
  Phone,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  useProviderLocations,
  useCreateLocation,
  useUpdateLocation,
  useDeleteLocation,
} from "../hooks/useProviders";
import { COLORS } from "../lib/colors";
import { WEEKDAYS, hoursToRows, rowsToHours, hoursSummary } from "../lib/hours";

// Locations management (c2b). Lists the provider's locations with add / edit /
// delete. NOTE the asymmetry vs services: a location DELETE is a HARD delete (the
// row is removed; past appointments are only unlinked via ON DELETE SET NULL) —
// the confirm copy makes that permanence clear. Loaded inside the shell, so
// providerId is always resolved.
export default function ProviderLocations({ providerId }) {
  const { data: locations, isLoading, isError, error } =
    useProviderLocations(providerId);

  const create = useCreateLocation(providerId);
  const update = useUpdateLocation(providerId);
  const del = useDeleteLocation(providerId);

  // null = closed; {} = add; { ...location } = edit.
  const [editing, setEditing] = useState(null);

  const onSubmit = (body) => {
    if (editing?.id != null) {
      update.mutate(
        { locationId: editing.id, ...body },
        {
          onSuccess: () => {
            toast.success("Location updated");
            setEditing(null);
          },
          onError: (err) =>
            toast.error(err?.message || "Couldn't save location"),
        },
      );
    } else {
      create.mutate(body, {
        onSuccess: () => {
          toast.success("Location added");
          setEditing(null);
        },
        onError: (err) => toast.error(err?.message || "Couldn't add location"),
      });
    }
  };

  const onDelete = (loc) => {
    if (
      window.confirm(
        `Permanently delete "${loc.name || "this location"}"? This cannot be undone. Past appointments stay but are unlinked from this location.`,
      )
    ) {
      del.mutate(loc.id, {
        onSuccess: () => toast.success("Location deleted"),
        onError: (err) => toast.error(err?.message || "Couldn't delete location"),
      });
    }
  };

  const list = locations ?? [];
  const saving = create.isPending || update.isPending;

  return (
    <div className="px-8 py-7">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: COLORS.peach }}
          >
            <MapPin className="h-5 w-5" style={{ color: COLORS.terracotta }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#3B241B]">Locations</h1>
            <p className="text-sm text-[#7A6254]">
              Where you see pets — shown to owners when they book
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setEditing({})}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white"
          style={{ backgroundColor: COLORS.coral }}
        >
          <Plus className="h-4 w-4" />
          Add location
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-[#FFD9B3] bg-white px-6 py-16 text-[#7A6254]">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: COLORS.coral }} />
          Loading locations…
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-[#FFD9B3] bg-white px-6 py-16 text-center">
          <p className="font-semibold text-[#B23B30]">Couldn't load locations</p>
          <p className="mt-1 text-sm text-[#7A6254]">
            {error?.message || "Please try again."}
          </p>
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-[#FFD9B3] bg-white px-6 py-16 text-center">
          <p className="text-base font-semibold text-[#3B241B]">
            No locations yet
          </p>
          <p className="mt-1 text-sm text-[#7A6254]">
            Add a location so owners know where to find you.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((loc) => {
            const summary = hoursSummary(loc.hours_json);
            const busy = del.isPending && del.variables === loc.id;
            return (
              <div
                key={loc.id}
                className="rounded-2xl border border-[#FFD9B3] bg-white p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-[#3B241B]">
                      {loc.name || "Unnamed location"}
                    </h3>
                    {loc.address && (
                      <p className="mt-0.5 text-sm text-[#7A6254]">
                        {loc.address}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <RowButton
                      label="Edit"
                      Icon={Pencil}
                      onClick={() => setEditing(loc)}
                      disabled={busy}
                      variant="muted"
                    />
                    <RowButton
                      label="Delete"
                      Icon={Trash2}
                      onClick={() => onDelete(loc)}
                      disabled={busy}
                      variant="danger"
                    />
                  </div>
                </div>

                <div className="mt-3 space-y-1.5 text-sm text-[#7A6254]">
                  {loc.phone && (
                    <p className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5" />
                      {loc.phone}
                    </p>
                  )}
                  {summary && (
                    <p className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5" />
                      {summary}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <LocationFormModal
          location={editing.id != null ? editing : null}
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

// Parse an optional coordinate text input. Returns { value } (undefined when
// blank) or { error }. Mirrors invalidLocationFields server-side.
function parseCoord(raw, { min, max, label }) {
  const str = String(raw ?? "").trim();
  if (str === "") return { value: undefined };
  const value = Number(str);
  if (!Number.isFinite(value) || value < min || value > max) {
    return { error: `${label} must be between ${min} and ${max}` };
  }
  return { value };
}

// Add / edit form in a lightweight modal. hours_json is edited via a per-weekday
// open/close grid; lat/lng are plain numeric inputs (no map this ticket) and are
// validated client-side before any request. An empty hours editor never blocks.
function LocationFormModal({ location, onClose, onSubmit, saving }) {
  const isEdit = location != null;
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm({
    defaultValues: { name: "", address: "", phone: "", lat: "", lng: "" },
  });
  const [hourRows, setHourRows] = useState(() => hoursToRows(null));

  useEffect(() => {
    reset({
      name: location?.name ?? "",
      address: location?.address ?? "",
      phone: location?.phone ?? "",
      lat: location?.lat != null ? String(location.lat) : "",
      lng: location?.lng != null ? String(location.lng) : "",
    });
    setHourRows(hoursToRows(location?.hours_json));
  }, [location, reset]);

  const setHour = (dayKey, field, value) =>
    setHourRows((prev) => ({
      ...prev,
      [dayKey]: { ...prev[dayKey], [field]: value },
    }));

  const submit = (values) => {
    const lat = parseCoord(values.lat, { min: -90, max: 90, label: "Latitude" });
    if (lat.error) {
      setError("lat", { type: "validate", message: lat.error });
      return;
    }
    const lng = parseCoord(values.lng, {
      min: -180,
      max: 180,
      label: "Longitude",
    });
    if (lng.error) {
      setError("lng", { type: "validate", message: lng.error });
      return;
    }

    const body = {
      name: values.name.trim(),
      address: values.address.trim(),
      phone: values.phone.trim(),
      lat: lat.value ?? null,
      lng: lng.value ?? null,
      hours_json: rowsToHours(hourRows) ?? null,
    };
    onSubmit(body);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Edit location" : "Add location"}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-7 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#3B241B]">
            {isEdit ? "Edit location" : "Add location"}
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
          <Field label="Location name" hint="Optional">
            <input
              type="text"
              placeholder="Main clinic"
              {...register("name")}
              className={inputCls}
            />
          </Field>

          <Field label="Address" hint="Optional">
            <input
              type="text"
              placeholder="123 Bark Street"
              {...register("address")}
              className={inputCls}
            />
          </Field>

          <Field label="Phone" hint="Optional">
            <input
              type="text"
              placeholder="+1 555 0100"
              {...register("phone")}
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude" hint="Optional" error={errors.lat?.message}>
              <input
                type="text"
                inputMode="decimal"
                placeholder="40.7128"
                {...register("lat")}
                className={inputCls}
              />
            </Field>
            <Field label="Longitude" hint="Optional" error={errors.lng?.message}>
              <input
                type="text"
                inputMode="decimal"
                placeholder="-74.0060"
                {...register("lng")}
                className={inputCls}
              />
            </Field>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#3B241B]">
              <Clock className="h-4 w-4 text-[#B8A99D]" />
              Opening hours
              <span className="text-xs font-normal text-[#B8A99D]">Optional</span>
            </p>
            <div className="space-y-2">
              {WEEKDAYS.map((day) => (
                <div key={day.key} className="flex items-center gap-3">
                  <span className="w-10 text-sm font-semibold text-[#7A6254]">
                    {day.label}
                  </span>
                  <input
                    type="time"
                    aria-label={`${day.label} open`}
                    value={hourRows[day.key]?.open ?? ""}
                    onChange={(e) => setHour(day.key, "open", e.target.value)}
                    className="flex-1 rounded-lg border-2 border-[#FFD9B3] bg-[#FFF7EF] px-2 py-1.5 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]"
                  />
                  <span className="text-[#B8A99D]">–</span>
                  <input
                    type="time"
                    aria-label={`${day.label} close`}
                    value={hourRows[day.key]?.close ?? ""}
                    onChange={(e) => setHour(day.key, "close", e.target.value)}
                    className="flex-1 rounded-lg border-2 border-[#FFD9B3] bg-[#FFF7EF] px-2 py-1.5 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]"
                  />
                </div>
              ))}
            </div>
          </div>

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
              {isEdit ? "Save changes" : "Add location"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RowButton({ label, Icon, onClick, disabled, variant }) {
  const styles = {
    primary: { backgroundColor: COLORS.coral, color: "#fff", border: "transparent" },
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

function Field({ label, error, hint, required, children }) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-2 text-sm font-semibold text-[#3B241B]">
        {label}
        {required && <span style={{ color: COLORS.coral }}>*</span>}
        {hint && <span className="text-xs font-normal text-[#B8A99D]">{hint}</span>}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-xs font-semibold text-[#B23B30]">{error}</p>
      )}
    </div>
  );
}

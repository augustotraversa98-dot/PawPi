import { useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  Building2,
  Save,
  Globe,
  EyeOff,
  Check,
  Loader2,
  Sparkles,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import {
  useProvider,
  useUpdateProviderProfile,
  useSetProviderStatus,
  useEnrichProvider,
  useProviderCapabilities,
  useAddCapability,
  useRemoveCapability,
} from "../hooks/useProviders";
import { COLORS } from "../lib/colors";
import { PROVIDER_TYPES } from "../lib/providerTypes";
import { groupedCapabilityOptions } from "../lib/capabilityGroups";
import AdvancedSection from "./AdvancedSection";
import ProviderAvailability from "./ProviderAvailability";

// Profile screen — load the provider, edit profile fields, and publish/unpublish.
// Loaded inside the shell so providerId is always resolved. Saves send ONLY the
// changed fields (PATCH whitelist); a 409 slug clash surfaces inline.
const EDITABLE = [
  "name",
  "provider_type",
  "bio",
  "logo_url",
  "slug",
  // Public business links (ticket 2.20).
  "website_url",
  "instagram_url",
  "facebook_url",
  "google_maps_url",
];

// Normalize a stored value to a controlled-input string so empty diffs cleanly.
const asStr = (v) => (v == null ? "" : String(v));

// Build the form seed from EDITABLE so the field list lives in ONE place.
const seedFrom = (p) =>
  Object.fromEntries(EDITABLE.map((f) => [f, asStr(p?.[f])]));

export default function ProviderProfile({ providerId }) {
  const { data, isLoading, isError, error } = useProvider(providerId);
  const provider = data?.provider;

  const update = useUpdateProviderProfile(providerId);
  const setStatus = useSetProviderStatus(providerId);
  const enrich = useEnrichProvider(providerId);
  // The auto-confirm toggle saves instantly (like publish), so it uses its own mutation
  // instance to keep its pending state separate from the profile-form Save button.
  const bookingSettings = useUpdateProviderProfile(providerId);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors, isDirty },
  } = useForm({
    defaultValues: seedFrom(null),
  });

  // Seed the form once the provider loads (and whenever it changes after a save).
  useEffect(() => {
    if (provider) {
      reset(seedFrom(provider));
    }
  }, [provider, reset]);

  const onSave = (values) => {
    // Diff against the loaded provider — send only what actually changed so the
    // backend never gets a no-op PATCH (which would 400 "No updatable fields").
    const changes = {};
    for (const field of EDITABLE) {
      const next = values[field]?.trim?.() ?? values[field];
      if (next !== asStr(provider?.[field])) changes[field] = next;
    }
    if (Object.keys(changes).length === 0) {
      toast("No changes to save");
      return;
    }
    update.mutate(changes, {
      onSuccess: (p) => {
        reset(seedFrom(p));
        toast.success("Profile saved");
      },
      onError: (err) => {
        const msg = err?.message || "Couldn't save profile";
        // Surface a slug clash inline (and as a toast) — the most common 409/400.
        if (/slug/i.test(msg)) setError("slug", { type: "server", message: msg });
        toast.error(msg);
      },
    });
  };

  const isPublished = provider?.status === "published";
  const onToggleStatus = () => {
    const next = isPublished ? "draft" : "published";
    setStatus.mutate(next, {
      onSuccess: () => {
        toast.success(
          next === "published" ? "Provider published" : "Provider unpublished",
        );
      },
      onError: (err) => toast.error(err?.message || "Couldn't change status"),
    });
  };

  const autoConfirm = provider?.auto_confirm_bookings === true;
  const onToggleAutoConfirm = () => {
    const next = !autoConfirm;
    bookingSettings.mutate(
      { auto_confirm_bookings: next },
      {
        onSuccess: () =>
          toast.success(
            next ? "New bookings will auto-confirm" : "Auto-confirm turned off",
          ),
        onError: (err) =>
          toast.error(err?.message || "Couldn't update booking settings"),
      },
    );
  };

  // Confirm-first import (ticket 2.21): fetch a PROPOSED draft from the provider's links and
  // PRE-FILL the editable fields — nothing is saved until the provider reviews + clicks Save.
  const onImport = () => {
    enrich.mutate(undefined, {
      onSuccess: ({ draft, sources }) => {
        if (draft?.description) {
          setValue("bio", draft.description, { shouldDirty: true });
        }
        const found = [];
        if (draft?.address) found.push("address");
        if (draft?.phone) found.push("phone");
        if (draft?.hours) found.push("hours");
        if (draft?.photos?.length) found.push(`${draft.photos.length} photo(s)`);
        const extra = found.length
          ? ` Also found ${found.join(", ")} — add via Locations/Services.`
          : "";
        toast.success(
          `Imported a draft from your links. Review and Save.${extra}`,
        );
        if (sources?.website === "failed" || sources?.google_place === "failed") {
          toast("Some links couldn't be read — fill those fields in manually.");
        }
      },
      onError: (err) =>
        toast.error(err?.message || "Couldn't import from the web"),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 px-8 py-20 text-[#7A6254]">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: COLORS.coral }} />
        Loading profile…
      </div>
    );
  }
  if (isError || !provider) {
    return (
      <div className="px-8 py-20 text-center">
        <p className="font-semibold text-[#B23B30]">Couldn't load this provider</p>
        <p className="mt-1 text-sm text-[#7A6254]">
          {error?.message || "Please try again."}
        </p>
      </div>
    );
  }

  return (
    <div className="px-8 py-7">
      <div className="mb-6 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: COLORS.peach }}
        >
          <Building2 className="h-5 w-5" style={{ color: COLORS.terracotta }} />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-[#3B241B]">Profile</h1>
          <p className="text-sm text-[#7A6254]">
            Your public business profile and listing status
          </p>
        </div>
        {/* Confirm-first enrichment (ticket 2.21) — proposes a draft from your links. */}
        <button
          type="button"
          onClick={onImport}
          disabled={enrich.isPending}
          className="flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-bold transition-opacity disabled:opacity-60"
          style={{ borderColor: COLORS.peach, color: COLORS.terracotta }}
        >
          {enrich.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {enrich.isPending ? "Importing…" : "Import from the web"}
        </button>
      </div>

      <StatusCard
        isPublished={isPublished}
        slug={provider.slug}
        onToggle={onToggleStatus}
        pending={setStatus.isPending}
      />

      <div className="mt-4">
        <BookingSettingsCard
          autoConfirm={autoConfirm}
          onToggle={onToggleAutoConfirm}
          pending={bookingSettings.isPending}
        />
      </div>

      <div className="mt-4">
        <CapabilitiesCard providerId={providerId} />
      </div>

      {/* Open hours (Phase 2) — the availability editor, relocated from its own nav page into
          a collapsible section here. Collapsed by default to keep Profile scannable; the editor
          manages its own hooks/mutations (its data loads when the section mounts). */}
      <div className="mt-4 rounded-2xl border border-[#FFD9B3] bg-white p-6">
        <AdvancedSection label="Open hours">
          <ProviderAvailability providerId={providerId} />
        </AdvancedSection>
      </div>

      <form
        onSubmit={handleSubmit(onSave)}
        className="mt-6 max-w-2xl space-y-5 rounded-2xl border border-[#FFD9B3] bg-white p-6"
      >
        <Field label="Business name" error={errors.name?.message} required>
          <input
            type="text"
            {...register("name", {
              required: "Business name is required",
              validate: (v) =>
                v.trim().length > 0 || "Business name is required",
            })}
            className={inputCls}
          />
        </Field>

        <Field label="Provider type" error={errors.provider_type?.message} required>
          <select
            aria-label="Provider type"
            {...register("provider_type", { required: "Choose a provider type" })}
            className={inputCls}
          >
            {PROVIDER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        {/* Optional profile + public-link fields (Phase 3): collapsed by default,
            still submit their values (changed-fields diff is unchanged). */}
        <AdvancedSection label="Public links">
          <Field
            label="Slug"
            error={errors.slug?.message}
            hint="Used in your public listing URL"
          >
            <input type="text" {...register("slug")} className={inputCls} />
          </Field>

          <Field label="Bio" hint="Optional">
            <textarea rows={3} {...register("bio")} className={`${inputCls} resize-y`} />
          </Field>

          <Field label="Logo URL" hint="Optional">
            <input type="text" {...register("logo_url")} className={inputCls} />
          </Field>

          {/* Public business links (ticket 2.20) — optional. */}
          <Field label="Website" hint="Optional">
            <input type="text" {...register("website_url")} className={inputCls} placeholder="https://…" />
          </Field>
          <Field label="Instagram" hint="Optional">
            <input type="text" {...register("instagram_url")} className={inputCls} placeholder="https://instagram.com/…" />
          </Field>
          <Field label="Facebook" hint="Optional">
            <input type="text" {...register("facebook_url")} className={inputCls} placeholder="https://facebook.com/…" />
          </Field>
          <Field label="Google Maps" hint="Optional">
            <input type="text" {...register("google_maps_url")} className={inputCls} placeholder="https://maps.google.com/…" />
          </Field>
        </AdvancedSection>

        <button
          type="submit"
          disabled={update.isPending || !isDirty}
          className="flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-60"
          style={{ backgroundColor: COLORS.coral }}
        >
          {update.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {update.isPending ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-3 py-2.5 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]";

// Status + publish toggle. When published, the public slug + listing path are
// shown (the public profile itself is served by the API and consumed by the
// owner mobile app — no public web page is built here).
function StatusCard({ isPublished, slug, onToggle, pending }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#FFD9B3] bg-white p-6">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#7A6254]">Status</span>
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={
              isPublished
                ? { backgroundColor: "#E5F4EC", color: "#1F7A4D" }
                : { backgroundColor: "#EFEAE6", color: "#7A6254" }
            }
          >
            {isPublished && <Check className="h-3 w-3" />}
            {isPublished ? "Published" : "Draft"}
          </span>
        </div>
        {isPublished ? (
          <p className="mt-2 text-sm text-[#7A6254]">
            Your listing is live. Pet owners can find you in discovery at{" "}
            <code className="rounded bg-[#FFF1E2] px-1.5 py-0.5 text-[#B75D32]">
              /providers/public/{slug}
            </code>
            .
          </p>
        ) : (
          <p className="mt-2 text-sm text-[#7A6254]">
            Your profile is a draft and not yet visible to pet owners. Publish to
            appear in discovery.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        className="flex items-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-bold transition-opacity disabled:opacity-60"
        style={
          isPublished
            ? { borderColor: "#FFD9B3", color: "#7A6254", backgroundColor: "#FFF7EF" }
            : { borderColor: "transparent", color: "#fff", backgroundColor: COLORS.coral }
        }
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isPublished ? (
          <EyeOff className="h-4 w-4" />
        ) : (
          <Globe className="h-4 w-4" />
        )}
        {isPublished ? "Unpublish" : "Publish"}
      </button>
    </div>
  );
}

// Booking settings — the auto-confirm toggle (0079). Saves instantly on toggle (like publish),
// so there is no Save button here. When ON, new bookings are accepted without a manual step;
// bookings that require upfront payment are still confirmed only after payment clears.
function BookingSettingsCard({ autoConfirm, onToggle, pending }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#FFD9B3] bg-white p-6">
      <div className="max-w-lg">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#7A6254]">
            Automatically confirm new bookings
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={
              autoConfirm
                ? { backgroundColor: "#E5F4EC", color: "#1F7A4D" }
                : { backgroundColor: "#EFEAE6", color: "#7A6254" }
            }
          >
            {autoConfirm && <Check className="h-3 w-3" />}
            {autoConfirm ? "On" : "Off"}
          </span>
        </div>
        <p className="mt-2 text-sm text-[#7A6254]">
          New bookings are accepted automatically. Bookings that require upfront payment are
          still confirmed after payment.
        </p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        className="flex items-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-bold transition-opacity disabled:opacity-60"
        style={
          autoConfirm
            ? { borderColor: "#FFD9B3", color: "#7A6254", backgroundColor: "#FFF7EF" }
            : { borderColor: "transparent", color: "#fff", backgroundColor: COLORS.coral }
        }
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {autoConfirm ? "Turn off" : "Turn on"}
      </button>
    </div>
  );
}

// Capability editor (ticket 2.1 → Phase 2). A multi-select of what the business
// offers, wired to POST/DELETE .../capabilities (owner|admin). Each toggle invalidates
// the ["providers"] query (see the hooks), so the shell sidebar re-filters its sections
// immediately — this is the "enable path" for a hidden module. Non-admins get a 403
// surfaced as a toast; the per-module server guards remain the real enforcement.
function CapabilitiesCard({ providerId }) {
  const { data: caps, isLoading } = useProviderCapabilities(providerId);
  const add = useAddCapability(providerId);
  const remove = useRemoveCapability(providerId);
  const selected = new Set(caps ?? []);
  const busy = add.isPending || remove.isPending;

  const toggle = (value) => {
    const mutation = selected.has(value) ? remove : add;
    mutation.mutate(value, {
      onError: (err) =>
        toast.error(err?.message || "Couldn't update what you offer"),
    });
  };

  return (
    <div className="rounded-2xl border border-[#FFD9B3] bg-white p-6">
      <div className="mb-1 flex items-center gap-2">
        <Layers className="h-4 w-4" style={{ color: COLORS.terracotta }} />
        <span className="text-sm font-semibold text-[#7A6254]">
          What this business offers
        </span>
      </div>
      <p className="mb-4 max-w-lg text-sm text-[#7A6254]">
        Turn services on or off. Your dashboard shows only the sections you offer —
        enabling one here reveals its tools in the sidebar.
      </p>
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-[#7A6254]">
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: COLORS.coral }} />
          Loading…
        </div>
      ) : (
        // Grouped under clear parent sections (ticket 2.89) so the list is easy to scan —
        // labels + grouping only, every underlying capability key unchanged.
        <div className="space-y-4">
          {groupedCapabilityOptions().map(({ section, options }) => (
            <div key={section}>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#B8A99D]">
                {section}
              </p>
              <div className="flex flex-wrap gap-2">
                {options.map(({ value, label }) => {
                  const on = selected.has(value);
                  const pendingThis =
                    (add.isPending && add.variables === value) ||
                    (remove.isPending && remove.variables === value);
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(value)}
                      disabled={busy}
                      className="flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-semibold transition-opacity disabled:opacity-60"
                      style={
                        on
                          ? {
                              borderColor: "transparent",
                              color: "#fff",
                              backgroundColor: COLORS.coral,
                            }
                          : {
                              borderColor: "#FFD9B3",
                              color: "#7A6254",
                              backgroundColor: "#FFF7EF",
                            }
                      }
                    >
                      {pendingThis ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : on ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : null}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, error, hint, required, children }) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-2 text-sm font-semibold text-[#3B241B]">
        {label}
        {required && <span style={{ color: COLORS.coral }}>*</span>}
        {hint && (
          <span className="text-xs font-normal text-[#B8A99D]">{hint}</span>
        )}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-xs font-semibold text-[#B23B30]">{error}</p>
      )}
    </div>
  );
}

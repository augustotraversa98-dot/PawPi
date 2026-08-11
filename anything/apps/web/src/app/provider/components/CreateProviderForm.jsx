import { useState } from "react";
import { useForm } from "react-hook-form";
import { Building2, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { useCreateProvider } from "../hooks/useProviders";
import { COLORS } from "../lib/colors";
import { PROVIDER_TYPES } from "../lib/providerTypes";
import { CAPABILITY_OPTIONS } from "../lib/capabilities";
import { groupedCapabilityOptions } from "../lib/capabilityGroups";
import AdvancedSection from "./AdvancedSection";

// Client-side validity mirror (lib/capabilities mirrors the server's ALLOWED_CAPABILITIES).
const VALID_CAPS = new Set(CAPABILITY_OPTIONS.map((c) => c.value));

// Onboarding (create) — shown to a logged-in user who is staff of no provider.
// Replaces c1's "coming soon" dead-end. On success useCreateProvider selects the
// new (draft) provider, the parent shell re-resolves it, and we land on the
// dashboard. name + provider_type are client-validated; a server 400 surfaces.
export default function CreateProviderForm() {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      name: "",
      provider_type: "",
      bio: "",
      logo_url: "",
      website_url: "",
      instagram_url: "",
      facebook_url: "",
      google_maps_url: "",
    },
  });
  const { mutate, isPending } = useCreateProvider();

  // Capability multi-select (Phase 3). Until the owner touches a chip, the selection
  // is DERIVED from the chosen provider type (a sensible pre-select); once they toggle
  // anything, `caps` takes over. Deriving (vs an effect) keeps type→cap in sync with no
  // extra state churn. `resolveCaps` is the single source used for both render + submit.
  const [caps, setCaps] = useState(new Set());
  const [capsTouched, setCapsTouched] = useState(false);
  const providerType = watch("provider_type");

  const resolveCaps = (type) =>
    capsTouched
      ? caps
      : new Set(type && VALID_CAPS.has(type) ? [type] : []);
  const selectedCaps = resolveCaps(providerType);

  const toggleCap = (value) => {
    const next = new Set(selectedCaps);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setCaps(next);
    setCapsTouched(true);
  };

  const onSubmit = (values) => {
    // Resolve the final capability list (derived default when untouched). An empty
    // list is sent as undefined so the POST route keeps its [provider_type] fallback.
    const chosen = [...resolveCaps(values.provider_type)];
    mutate(
      {
        name: values.name.trim(),
        provider_type: values.provider_type,
        capabilities: chosen.length ? chosen : undefined,
        bio: values.bio?.trim() || undefined,
        logo_url: values.logo_url?.trim() || undefined,
        // Optional public links (ticket 2.20).
        website_url: values.website_url?.trim() || undefined,
        instagram_url: values.instagram_url?.trim() || undefined,
        facebook_url: values.facebook_url?.trim() || undefined,
        google_maps_url: values.google_maps_url?.trim() || undefined,
      },
      {
        onError: (err) => {
          toast.error(err?.message || "Couldn't create your provider");
        },
        // No success toast: the shell swaps straight to the dashboard, which is
        // confirmation enough.
      },
    );
  };

  return (
    <div
      className="flex min-h-screen w-full items-center justify-center p-6"
      style={{ backgroundColor: COLORS.cream }}
    >
      <div className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: COLORS.peach }}
          >
            <Building2 className="h-7 w-7" style={{ color: COLORS.terracotta }} />
          </div>
          <h1 className="mb-1 text-2xl font-bold text-[#3B241B]">
            Create your provider
          </h1>
          <p className="text-sm text-[#7A6254]">
            Set up your business profile to manage bookings and client care. You
            can edit everything later and publish when you're ready.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <Field label="Business name" error={errors.name?.message} required>
            <input
              type="text"
              placeholder="Happy Paws Veterinary"
              {...register("name", {
                required: "Business name is required",
                validate: (v) =>
                  v.trim().length > 0 || "Business name is required",
              })}
              className="w-full rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-3 py-2.5 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]"
            />
          </Field>

          <Field
            label="Provider type"
            error={errors.provider_type?.message}
            required
          >
            <select
              aria-label="Provider type"
              {...register("provider_type", {
                required: "Choose a provider type",
              })}
              className="w-full rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-3 py-2.5 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]"
            >
              <option value="">Select a type…</option>
              {PROVIDER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>

          {/* Capability multi-select (Phase 3) — what the business offers. Pre-selects the
              capability matching the chosen type; the owner can add more so a new provider
              isn't stuck with a single seeded capability. */}
          <Field
            label="What this business offers"
            hint="You can change this later"
          >
            {/* Grouped under clear parent sections (ticket 2.89) — labels + grouping only,
                every underlying capability key unchanged. */}
            <div className="space-y-4">
              {groupedCapabilityOptions().map(({ section, options }) => (
                <div key={section}>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#B8A99D]">
                    {section}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {options.map(({ value, label }) => {
                      const on = selectedCaps.has(value);
                      return (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleCap(value)}
                          className="flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-semibold"
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
                          {on && <Check className="h-3.5 w-3.5" />}
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Field>

          {/* Optional profile + public-link fields (Phase 3): collapsed by default. */}
          <AdvancedSection>
            <Field label="Bio" hint="Optional">
              <textarea
                rows={3}
                placeholder="Tell pet owners about your practice…"
                {...register("bio")}
                className="w-full resize-y rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-3 py-2.5 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]"
              />
            </Field>

            <Field label="Logo URL" hint="Optional">
              <input
                type="text"
                placeholder="https://…"
                {...register("logo_url")}
                className="w-full rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-3 py-2.5 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]"
              />
            </Field>

            {/* Public business links (ticket 2.20) — optional. */}
            {[
              { name: "website_url", label: "Website", ph: "https://…" },
              { name: "instagram_url", label: "Instagram", ph: "https://instagram.com/…" },
              { name: "facebook_url", label: "Facebook", ph: "https://facebook.com/…" },
              { name: "google_maps_url", label: "Google Maps", ph: "https://maps.google.com/…" },
            ].map((f) => (
              <Field key={f.name} label={f.label} hint="Optional">
                <input
                  type="text"
                  placeholder={f.ph}
                  {...register(f.name)}
                  className="w-full rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-3 py-2.5 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]"
                />
              </Field>
            ))}
          </AdvancedSection>

          <button
            type="submit"
            disabled={isPending}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-bold text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: COLORS.coral }}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isPending ? "Creating…" : "Create provider"}
          </button>
        </form>
      </div>
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
      {error && <p className="mt-1 text-xs font-semibold text-[#B23B30]">{error}</p>}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Tag, Plus, Pencil, Ban, Power, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  useProviderServices,
  useCreateService,
  useUpdateService,
  useDeactivateService,
  useProviderCapabilities,
} from "../hooks/useProviders";
import { COLORS } from "../lib/colors";
import ImageUploader from "./ImageUploader";
import AdvancedSection from "./AdvancedSection";
import DocumentCatalogImport from "./DocumentCatalogImport";
import ProviderWalkPackages from "./ProviderWalkPackages";
import {
  centsToCurrency,
  centsToInput,
  dollarsToCents,
  parseDurationMin,
} from "../lib/money";
import servicesCopy from "../i18n/services";
import sharedCopy from "../i18n/shared";
import { useProviderCopy } from "../i18n/lib/useProviderCopy";
import { fill } from "../i18n/lib/format";
import { serverErrorMessage } from "../i18n/lib/serverError";

// Services management (c2b). Lists ALL of the provider's services — active AND
// inactive (inactive rows are dimmed + badged). Owner/admin can add, edit,
// deactivate (SOFT delete → active=false) and reactivate (PATCH active=true).
// These are exactly the services the owner booking screen lists, so editing here
// changes what owners can pick. Loaded inside the shell, so providerId is set.
export default function ProviderServices({ providerId }) {
  const { t, lang } = useProviderCopy(servicesCopy);
  const failed = (fallback) => (err) =>
    toast.error(serverErrorMessage(err, lang, fallback, servicesCopy));
  const { data: services, isLoading, isError, error } =
    useProviderServices(providerId);
  // Walk packages (ticket B2) show as a sibling section for walker-capable providers only.
  const { data: capabilities } = useProviderCapabilities(providerId);
  const isWalker = Array.isArray(capabilities) && capabilities.includes("walker");

  const create = useCreateService(providerId);
  const update = useUpdateService(providerId);
  const deactivate = useDeactivateService(providerId);

  // null = modal closed; { } = add; { ...service } = edit a specific service.
  const [editing, setEditing] = useState(null);

  const onSubmit = (body) => {
    if (editing?.id != null) {
      update.mutate(
        { serviceId: editing.id, ...body },
        {
          onSuccess: () => {
            toast.success(t.updated);
            setEditing(null);
          },
          onError: failed(t.saveFailed),
        },
      );
    } else {
      create.mutate(body, {
        onSuccess: () => {
          toast.success(t.added);
          setEditing(null);
        },
        onError: failed(t.addFailed),
      });
    }
  };

  const onDeactivate = (s) => {
    if (window.confirm(fill(t.confirmDeactivate, { name: s.name }))) {
      deactivate.mutate(s.id, {
        onSuccess: () => toast.success(t.deactivated),
        onError: failed(t.deactivateFailed),
      });
    }
  };

  const onReactivate = (s) => {
    update.mutate(
      { serviceId: s.id, active: true },
      {
        onSuccess: () => toast.success(t.reactivated),
        onError: failed(t.reactivateFailed),
      },
    );
  };

  const list = services ?? [];
  const saving = create.isPending || update.isPending;

  return (
    <div className="px-8 py-7">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: COLORS.peach }}
          >
            <Tag className="h-5 w-5" style={{ color: COLORS.terracotta }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#3B241B]">{t.title}</h1>
            <p className="text-sm text-[#7A6254]">{t.subtitle}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setEditing({})}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white"
          style={{ backgroundColor: COLORS.coral }}
        >
          <Plus className="h-4 w-4" />
          {t.add}
        </button>
      </div>

      {/* Document enrichment (ticket 2.82) — propose a catalog from an uploaded price list/menu. */}
      <DocumentCatalogImport providerId={providerId} />

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
            <p className="font-semibold text-[#B23B30]">{t.loadErrorTitle}</p>
            <p className="mt-1 text-sm text-[#7A6254]">
              {serverErrorMessage(error, lang, t.tryAgain, servicesCopy)}
            </p>
          </div>
        ) : list.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-base font-semibold text-[#3B241B]">{t.emptyTitle}</p>
            <p className="mt-1 text-sm text-[#7A6254]">{t.emptyBody}</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#FFF1E2] bg-[#FFFBF6]">
                {Object.entries(t.columns).map(([column, label]) => (
                  <th
                    key={column}
                    className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-[#7A6254]"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const inactive = !s.active;
                const busy =
                  (deactivate.isPending && deactivate.variables === s.id) ||
                  (update.isPending && update.variables?.serviceId === s.id);
                return (
                  <tr
                    key={s.id}
                    className={`border-b border-[#FFF7EF] last:border-0 hover:bg-[#FFFBF6] ${
                      inactive ? "opacity-60" : ""
                    }`}
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-start gap-3">
                        {Array.isArray(s.image_urls) && s.image_urls[0] && (
                          <img
                            src={s.image_urls[0]}
                            alt={s.name}
                            className="h-10 w-10 flex-shrink-0 rounded-lg object-cover"
                            style={{ backgroundColor: COLORS.cream }}
                          />
                        )}
                        <div>
                          <div className="font-semibold text-[#3B241B]">
                            {s.name}
                          </div>
                          {s.description && (
                            <div className="mt-0.5 max-w-md text-xs text-[#7A6254]">
                              {s.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-[#3B241B]">
                      {s.duration_min != null
                        ? fill(t.minutesShort, { minutes: s.duration_min })
                        : "—"}
                    </td>
                    <td className="px-4 py-3 align-top text-[#3B241B]">
                      {centsToCurrency(s.price_cents, lang)}
                    </td>
                    <td className="px-4 py-3 align-top text-[#3B241B]">
                      {centsToCurrency(s.deposit_cents, lang)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {inactive ? (
                        <span
                          className="inline-block rounded-full px-2.5 py-1 text-xs font-semibold"
                          style={{ backgroundColor: "#EFEAE6", color: "#7A6254" }}
                        >
                          {t.inactive}
                        </span>
                      ) : (
                        <span
                          className="inline-block rounded-full px-2.5 py-1 text-xs font-semibold"
                          style={{ backgroundColor: "#E5F4EC", color: "#1F7A4D" }}
                        >
                          {t.active}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap items-center gap-2">
                        <RowButton
                          label={t.edit}
                          Icon={Pencil}
                          onClick={() => setEditing(s)}
                          disabled={busy}
                          variant="muted"
                        />
                        {inactive ? (
                          <RowButton
                            label={t.reactivate}
                            Icon={Power}
                            onClick={() => onReactivate(s)}
                            disabled={busy}
                            variant="primary"
                          />
                        ) : (
                          <RowButton
                            label={t.deactivate}
                            Icon={Ban}
                            onClick={() => onDeactivate(s)}
                            disabled={busy}
                            variant="danger"
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <ServiceFormModal
          service={editing.id != null ? editing : null}
          onClose={() => setEditing(null)}
          onSubmit={onSubmit}
          saving={saving}
        />
      )}

      {/* Walk packages (ticket B2) — a sibling section, walker providers only. */}
      {isWalker && (
        <div className="-mx-8 mt-8 border-t border-[#FFE7CE]">
          <ProviderWalkPackages providerId={providerId} />
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-3 py-2.5 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]";

// Add / edit form in a lightweight modal. Money is entered in dollars and
// converted to integer cents on submit; numeric validation mirrors
// invalidServiceFields and blocks the mutation before any POST/PATCH fires.
function ServiceFormModal({ service, onClose, onSubmit, saving }) {
  const { t, lang } = useProviderCopy(servicesCopy);
  // Amount and duration errors are worded in the shared dictionary, looked up at render.
  const { t: shared } = useProviderCopy(sharedCopy);
  const isEdit = service != null;
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm({
    defaultValues: {
      name: "",
      description: "",
      duration_min: "",
      price: "",
      deposit: "",
      payment_policy: "none",
      nightly_rate: "",
    },
  });

  // image_urls is an ordered array, not a text field — kept outside react-hook-form
  // and seeded from the service when editing (ticket 2.23).
  const [images, setImages] = useState([]);

  useEffect(() => {
    reset({
      name: service?.name ?? "",
      description: service?.description ?? "",
      duration_min: service?.duration_min != null ? String(service.duration_min) : "",
      price: centsToInput(service?.price_cents, lang),
      deposit: centsToInput(service?.deposit_cents, lang),
      payment_policy: service?.payment_policy ?? "none",
      nightly_rate: centsToInput(service?.nightly_rate_cents, lang),
    });
    setImages(Array.isArray(service?.image_urls) ? service.image_urls : []);
    // Seeded once per service: a language switch must not wipe what is being typed (either format parses).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, reset]);

  const submit = (values) => {
    // Convert + validate the numeric fields up front; a bad value sets a field
    // error and returns WITHOUT calling onSubmit (so no request is made).
    const duration = parseDurationMin(values.duration_min);
    if (duration.error) {
      setError("duration_min", { type: "validate" });
      return;
    }
    const price = dollarsToCents(values.price, lang);
    if (price.error) {
      setError("price", { type: "validate" });
      return;
    }
    const deposit = dollarsToCents(values.deposit, lang);
    if (deposit.error) {
      setError("deposit", { type: "validate" });
      return;
    }
    const nightly = dollarsToCents(values.nightly_rate, lang);
    if (nightly.error) {
      setError("nightly_rate", { type: "validate" });
      return;
    }

    const body = {
      name: values.name.trim(),
      description: values.description.trim(),
      duration_min: duration.value ?? null,
      price_cents: price.cents ?? null,
      deposit_cents: deposit.cents ?? null,
      payment_policy: values.payment_policy,
      nightly_rate_cents: nightly.cents ?? null,
      image_urls: images,
    };
    onSubmit(body);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? t.form.editTitle : t.form.addTitle}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-7 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#3B241B]">
            {isEdit ? t.form.editTitle : t.form.addTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.form.close}
            className="rounded-lg p-1.5 text-[#7A6254] hover:bg-[#FFF7EF]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <Field label={t.form.name} error={errors.name && t.form.nameRequired} required>
            <input
              type="text"
              placeholder={t.form.namePlaceholder}
              {...register("name", {
                required: true,
                validate: (v) => v.trim().length > 0,
              })}
              className={inputCls}
            />
          </Field>

          <Field
            label={t.form.duration}
            hint={t.form.durationHint}
            error={errors.duration_min && shared.inputs.invalidMinutes}
          >
            <input
              type="text"
              inputMode="numeric"
              placeholder="30"
              {...register("duration_min")}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-[#7A6254]">{t.form.durationHelp}</p>
          </Field>

          <Field
            label={t.form.price}
            hint="$"
            error={errors.price && shared.inputs.invalidAmount}
          >
            <input
              type="text"
              inputMode="decimal"
              placeholder={centsToInput(5000, lang)}
              {...register("price")}
              className={inputCls}
            />
          </Field>

          {/* Less-common fields (Phase 3): still submit their values when collapsed. */}
          <AdvancedSection>
            <Field label={t.form.description} hint={t.form.optional}>
              <textarea
                rows={2}
                {...register("description")}
                className={`${inputCls} resize-y`}
              />
            </Field>

            <Field
              label={t.form.deposit}
              hint="$"
              error={errors.deposit && shared.inputs.invalidAmount}
            >
              <input
                type="text"
                inputMode="decimal"
                placeholder={centsToInput(0, lang)}
                {...register("deposit")}
                className={inputCls}
              />
            </Field>

            <Field label={t.form.payment} hint={t.form.paymentHint}>
              <select {...register("payment_policy")} className={inputCls}>
                <option value="none">{t.form.paymentNone}</option>
                <option value="deposit">{t.form.paymentDeposit}</option>
                <option value="full">{t.form.paymentFull}</option>
              </select>
              <p className="mt-1 text-xs text-[#7A6254]">{t.form.paymentHelp}</p>
            </Field>

            <Field
              label={t.form.nightlyRate}
              hint={t.form.nightlyRateHint}
              error={errors.nightly_rate && shared.inputs.invalidAmount}
            >
              <input
                type="text"
                inputMode="decimal"
                placeholder={centsToInput(4000, lang)}
                {...register("nightly_rate")}
                className={inputCls}
              />
              <p className="mt-1 text-xs text-[#7A6254]">{t.form.nightlyRateHelp}</p>
            </Field>

            <ImageUploader label={t.form.photos} value={images} onChange={setImages} />
          </AdvancedSection>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-4 py-2.5 text-sm font-bold text-[#7A6254]"
            >
              {t.form.cancel}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: COLORS.coral }}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? t.form.save : t.form.addTitle}
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

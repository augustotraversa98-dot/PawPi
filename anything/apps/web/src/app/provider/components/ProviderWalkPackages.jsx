import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Footprints, Plus, Pencil, Ban, Power, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  useWalkPackages,
  useCreateWalkPackage,
  useUpdateWalkPackage,
  useDeactivateWalkPackage,
} from "../hooks/useProviders";
import { COLORS } from "../lib/colors";
import { centsToCurrency, centsToInput, dollarsToCents } from "../lib/money";
import walkPackagesCopy from "../i18n/walkPackages";
import sharedCopy from "../i18n/shared";
import { useProviderCopy } from "../i18n/lib/useProviderCopy";
import { fill, plural } from "../i18n/lib/format";
import { serverErrorMessage } from "../i18n/lib/serverError";

// Walk packages editor (ticket B2). Only rendered for walker-capable providers (gated by the
// caller). Lists the walker's prepaid packs (active + inactive), and offers the THREE DEFAULT
// pack sizes (single / 10 / 20) as SUGGESTIONS the walker prices + activates — never auto-created
// rows (real data only). An owner buys these on mobile; a paid order grants a credit balance.
const DEFAULT_SUGGESTIONS = [1, 10, 20];
const COLUMNS = ["package", "price", "perWalk", "status", "actions"];

export default function ProviderWalkPackages({ providerId }) {
  const { data: packages, isLoading, isError, error } = useWalkPackages(providerId);
  const create = useCreateWalkPackage(providerId);
  const update = useUpdateWalkPackage(providerId);
  const deactivate = useDeactivateWalkPackage(providerId);
  const { t, lang } = useProviderCopy(walkPackagesCopy);
  const failed = (err, fallback) => serverErrorMessage(err, lang, fallback, walkPackagesCopy);

  // null = closed; { walks_count } = add (optionally pre-seeded); { ...pkg } = edit.
  const [editing, setEditing] = useState(null);

  const list = packages ?? [];
  const saving = create.isPending || update.isPending;

  // Which default sizes aren't offered yet → shown as one-tap "Add" suggestions.
  const existingCounts = new Set(list.map((p) => p.walks_count));
  const suggestions = DEFAULT_SUGGESTIONS.filter((n) => !existingCounts.has(n));

  const onSubmit = (body) => {
    if (editing?.id != null) {
      update.mutate(
        { packageId: editing.id, ...body },
        {
          onSuccess: () => {
            toast.success(t.toasts.updated);
            setEditing(null);
          },
          onError: (err) => toast.error(failed(err, t.toasts.saveFailed)),
        },
      );
    } else {
      create.mutate(body, {
        onSuccess: () => {
          toast.success(t.toasts.added);
          setEditing(null);
        },
        onError: (err) => toast.error(failed(err, t.toasts.addFailed)),
      });
    }
  };

  const onDeactivate = (p) => {
    if (window.confirm(plural(t.confirmDeactivate, p.walks_count, lang))) {
      deactivate.mutate(p.id, {
        onSuccess: () => toast.success(t.toasts.deactivated),
        onError: (err) => toast.error(failed(err, t.toasts.deactivateFailed)),
      });
    }
  };

  const onReactivate = (p) => {
    update.mutate(
      { packageId: p.id, active: true },
      {
        onSuccess: () => toast.success(t.toasts.reactivated),
        onError: (err) => toast.error(failed(err, t.toasts.reactivateFailed)),
      },
    );
  };

  return (
    <div className="px-8 py-7">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: COLORS.peach }}
          >
            <Footprints className="h-5 w-5" style={{ color: COLORS.terracotta }} />
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
          {t.addPackage}
        </button>
      </div>

      {/* Default-size suggestions (single / 10 / 20) not yet offered — price + activate in one tap. */}
      {suggestions.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#7A6254]">
            {t.quickAdd}
          </span>
          {suggestions.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setEditing({ walks_count: n })}
              className="rounded-full border-2 px-3 py-1 text-sm font-semibold"
              style={{ borderColor: COLORS.peach, color: COLORS.terracotta, backgroundColor: "#FFF7EF" }}
            >
              + {n === 1 ? t.singleWalk : fill(t.packOf, { count: n })}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[#FFD9B3] bg-white">
        {isLoading ? (
          <div className="flex items-center justify-center gap-3 px-6 py-16 text-[#7A6254]">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: COLORS.coral }} />
            {t.loading}
          </div>
        ) : isError ? (
          <div className="px-6 py-16 text-center">
            <p className="font-semibold text-[#B23B30]">{t.loadFailedTitle}</p>
            <p className="mt-1 text-sm text-[#7A6254]">{failed(error, t.loadFailedBody)}</p>
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
              {list.map((p) => {
                const inactive = !p.active;
                const perWalk = p.walks_count > 0 ? Math.round(p.price_cents / p.walks_count) : 0;
                const busy =
                  (deactivate.isPending && deactivate.variables === p.id) ||
                  (update.isPending && update.variables?.packageId === p.id);
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-[#FFF7EF] last:border-0 hover:bg-[#FFFBF6] ${
                      inactive ? "opacity-60" : ""
                    }`}
                  >
                    <td className="px-4 py-3 align-top font-semibold text-[#3B241B]">
                      {p.walks_count === 1 ? t.singleWalk : fill(t.walks, { count: p.walks_count })}
                    </td>
                    <td className="px-4 py-3 align-top text-[#3B241B]">
                      {centsToCurrency(p.price_cents, lang)}
                    </td>
                    <td className="px-4 py-3 align-top text-[#7A6254]">
                      {centsToCurrency(perWalk, lang)}
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
                        <RowButton label={t.edit} Icon={Pencil} onClick={() => setEditing(p)} disabled={busy} variant="muted" />
                        {inactive ? (
                          <RowButton label={t.reactivate} Icon={Power} onClick={() => onReactivate(p)} disabled={busy} variant="primary" />
                        ) : (
                          <RowButton label={t.deactivate} Icon={Ban} onClick={() => onDeactivate(p)} disabled={busy} variant="danger" />
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
        <PackageFormModal
          pkg={editing.id != null ? editing : null}
          seedCount={editing.id == null ? editing.walks_count : undefined}
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

function PackageFormModal({ pkg, seedCount, onClose, onSubmit, saving }) {
  const isEdit = pkg != null;
  const { t, lang } = useProviderCopy(walkPackagesCopy);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm({ defaultValues: { walks_count: "", price: "" } });

  useEffect(() => {
    reset({
      walks_count:
        pkg?.walks_count != null
          ? String(pkg.walks_count)
          : seedCount != null
            ? String(seedCount)
            : "",
      price: centsToInput(pkg?.price_cents, lang),
    });
    // Seeded once per package: a language switch must not wipe what is being typed (either format parses).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkg, seedCount, reset]);

  const submit = (values) => {
    const walks = parseInt(values.walks_count, 10);
    if (!Number.isInteger(walks) || walks <= 0) {
      setError("walks_count", { type: "validate" });
      return;
    }
    const price = dollarsToCents(values.price, lang);
    if (price.error) {
      setError("price", { type: "validate" });
      return;
    }
    onSubmit({ walks_count: walks, price_cents: price.cents ?? 0 });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? t.editPackage : t.addPackage}
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#3B241B]">
            {isEdit ? t.editPackage : t.addPackage}
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
          <Field
            label={t.form.walksLabel}
            error={errors.walks_count ? t.form.walksInvalid : null}
            required
          >
            <input
              type="text"
              inputMode="numeric"
              placeholder="10"
              {...register("walks_count")}
              className={inputCls}
            />
          </Field>

          <Field
            label={t.form.priceLabel}
            hint="$"
            error={errors.price ? sharedCopy[lang].inputs.invalidAmount : null}
            required
          >
            <input
              type="text"
              inputMode="decimal"
              placeholder={centsToInput(9000, lang)}
              {...register("price")}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-[#7A6254]">{t.form.priceHelp}</p>
          </Field>

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
              {isEdit ? t.form.save : t.addPackage}
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
      style={{ backgroundColor: styles.backgroundColor, color: styles.color, borderColor: styles.border }}
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
      {error && <p className="mt-1 text-xs font-semibold text-[#B23B30]">{error}</p>}
    </div>
  );
}

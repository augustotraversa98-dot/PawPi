import { useState } from "react";
import { FileUp, Loader2, Check, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  useEnrichProviderDocument,
  useCreateService,
  useCreateShopProduct,
} from "../hooks/useProviders";
import useUpload from "@/utils/useUpload";
import { COLORS } from "../lib/colors";
import {
  dollarsToCents,
  importedPriceToInput,
  parseDurationMin,
} from "../lib/money";
import catalogImportCopy from "../i18n/catalogImport";
import { useProviderCopy } from "../i18n/lib/useProviderCopy";
import { fill } from "../i18n/lib/format";
import { serverErrorMessage } from "../i18n/lib/serverError";

// DocumentCatalogImport (ticket 2.82) — the confirm-first review panel for the DOCUMENT enrichment
// source. The provider uploads a price-list/menu (PDF or Excel/CSV) through the existing Storage
// path (useUpload); the file is transient input to POST .../enrich/document, which PROPOSES a
// { services, products } catalog (writing NOTHING). Each proposed row is editable with Apply/Skip;
// Apply routes through the EXISTING owner-identity CRUD (useCreateService / useCreateShopProduct),
// so RLS + validation always apply. Dormant behind ENRICHMENT_LLM_KEY → a clean "not set up yet".
export default function DocumentCatalogImport({ providerId }) {
  const enrich = useEnrichProviderDocument(providerId);
  const createService = useCreateService(providerId);
  const createProduct = useCreateShopProduct(providerId);
  const [upload, { loading: uploading }] = useUpload();
  const { t, lang } = useProviderCopy(catalogImportCopy);
  const failed = (err, fallback) => serverErrorMessage(err, lang, fallback, catalogImportCopy);

  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null); // [{ kind, name, price, duration?, description, status }]
  const [notConfigured, setNotConfigured] = useState(false);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setNotConfigured(false);

    const up = await upload({ file });
    if (up?.error || !up?.url) {
      toast.error(failed(up?.error, t.uploadFailed));
      return;
    }
    enrich.mutate(
      { url: up.url, filename: file.name, mimeType: file.type },
      {
        onSuccess: (data) => {
          const services = (data?.draft?.services ?? []).map((s, i) => ({
            key: `s${i}`,
            kind: "service",
            name: s.name ?? "",
            price: importedPriceToInput(s.price, lang),
            duration: s.duration ?? "",
            description: s.description ?? "",
            status: "pending",
          }));
          const products = (data?.draft?.products ?? []).map((p, i) => ({
            key: `p${i}`,
            kind: "product",
            name: p.name ?? "",
            price: importedPriceToInput(p.price, lang),
            description: p.description ?? "",
            status: "pending",
          }));
          const all = [...services, ...products];
          setRows(all);
          if (all.length === 0) {
            toast.info(t.nothingFound);
          }
        },
        onError: (err) => {
          if (err?.status === 503 || /not set up/i.test(err?.message || "")) {
            setNotConfigured(true);
          } else {
            toast.error(failed(err, t.readFailed));
          }
        },
      },
    );
  };

  const setRow = (key, patch) =>
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );

  const apply = (row) => {
    if (!row.name?.trim()) {
      toast.error(t.nameRequired);
      return;
    }
    const price = dollarsToCents(row.price, lang);
    if (price.error) {
      toast.error(price.error);
      return;
    }
    if (row.kind === "service") {
      const dur = parseDurationMin(row.duration, lang);
      if (dur.error) {
        toast.error(dur.error);
        return;
      }
      createService.mutate(
        {
          name: row.name.trim(),
          description: row.description?.trim() || undefined,
          price_cents: price.cents ?? null,
          duration_min: dur.value ?? null,
        },
        {
          onSuccess: () => {
            toast.success(fill(t.serviceAdded, { name: row.name.trim() }));
            setRow(row.key, { status: "applied" });
          },
          onError: (err) => toast.error(failed(err, t.serviceFailed)),
        },
      );
    } else {
      createProduct.mutate(
        {
          name: row.name.trim(),
          description: row.description?.trim() || undefined,
          price_cents: price.cents ?? 0,
        },
        {
          onSuccess: () => {
            toast.success(fill(t.productAdded, { name: row.name.trim() }));
            setRow(row.key, { status: "applied" });
          },
          onError: (err) => toast.error(failed(err, t.productFailed)),
        },
      );
    }
  };

  const pending = (rows ?? []).filter((r) => r.status === "pending");

  return (
    <div className="mb-6 rounded-2xl border border-[#FFD9B3] bg-[#FFFBF5] p-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 text-left"
      >
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: COLORS.peach }}
        >
          <Sparkles className="h-4 w-4" style={{ color: COLORS.terracotta }} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-[#3B241B]">
            {t.title}
          </p>
          <p className="text-xs text-[#7A6254]">{t.subtitle}</p>
        </div>
      </button>

      {open && (
        <div className="mt-4">
          <label
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-[#FFD9B3] bg-white px-4 py-2.5 text-sm font-semibold text-[#7A6254] hover:border-[#FF6F61]"
          >
            {uploading || enrich.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="h-4 w-4" />
            )}
            {uploading ? t.uploading : enrich.isPending ? t.reading : t.choose}
            <input
              type="file"
              accept=".pdf,.csv,.xlsx,.xls,application/pdf,text/csv"
              className="hidden"
              onChange={onFile}
              aria-label={t.fileAria}
            />
          </label>

          {notConfigured && (
            <p className="mt-3 text-sm text-[#7A6254]">
              {t.notConfigured}
            </p>
          )}

          {rows != null && pending.length === 0 && !enrich.isPending && (
            <p className="mt-3 text-sm text-[#7A6254]">
              {rows.length === 0 ? t.nothingToImport : t.allHandled}
            </p>
          )}

          {pending.length > 0 && (
            <div className="mt-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#B8A99D]">
                {t.proposedHeading}
              </p>
              {pending.map((row) => (
                <ProposedRow
                  key={row.key}
                  row={row}
                  onChange={(patch) => setRow(row.key, patch)}
                  onApply={() => apply(row)}
                  onSkip={() => setRow(row.key, { status: "skipped" })}
                  saving={createService.isPending || createProduct.isPending}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const cell =
  "rounded-lg border-2 border-[#FFD9B3] bg-white px-2 py-1.5 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]";

function ProposedRow({ row, onChange, onApply, onSkip, saving }) {
  const { t } = useProviderCopy(catalogImportCopy);
  return (
    <div className="rounded-xl border border-[#FFD9B3] bg-white p-3">
      <div className="mb-2 flex items-center gap-2">
        <span
          className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase"
          style={{ backgroundColor: COLORS.peach, color: COLORS.terracotta }}
        >
          {t.kinds[row.kind] ?? row.kind}
        </span>
        <input
          value={row.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={t.row.namePlaceholder}
          aria-label={t.row.nameAria}
          className={`${cell} flex-1`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={row.price}
          onChange={(e) => onChange({ price: e.target.value })}
          placeholder={t.row.pricePlaceholder}
          aria-label={t.row.priceAria}
          inputMode="decimal"
          className={`${cell} w-28`}
        />
        {row.kind === "service" && (
          <input
            value={row.duration}
            onChange={(e) => onChange({ duration: e.target.value })}
            placeholder={t.row.durationPlaceholder}
            aria-label={t.row.durationAria}
            inputMode="numeric"
            className={`${cell} w-20`}
          />
        )}
        <input
          value={row.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder={t.row.descriptionPlaceholder}
          aria-label={t.row.descriptionAria}
          className={`${cell} min-w-[8rem] flex-1`}
        />
        <button
          type="button"
          onClick={onApply}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
          style={{ backgroundColor: COLORS.coral }}
        >
          <Check className="h-3.5 w-3.5" />
          {t.row.apply}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="inline-flex items-center gap-1 rounded-lg border border-[#FFD9B3] bg-[#FFF7EF] px-3 py-1.5 text-xs font-semibold text-[#7A6254]"
        >
          <X className="h-3.5 w-3.5" />
          {t.row.skip}
        </button>
      </div>
    </div>
  );
}

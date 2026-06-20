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
import { dollarsToCents, parseDurationMin } from "../lib/money";

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
      toast.error(up?.error || "Upload failed");
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
            price: s.price ?? "",
            duration: s.duration ?? "",
            description: s.description ?? "",
            status: "pending",
          }));
          const products = (data?.draft?.products ?? []).map((p, i) => ({
            key: `p${i}`,
            kind: "product",
            name: p.name ?? "",
            price: p.price ?? "",
            description: p.description ?? "",
            status: "pending",
          }));
          const all = [...services, ...products];
          setRows(all);
          if (all.length === 0) {
            toast.info("No services or products found in that file");
          }
        },
        onError: (err) => {
          if (err?.status === 503 || /not set up/i.test(err?.message || "")) {
            setNotConfigured(true);
          } else {
            toast.error(err?.message || "Couldn't read that document");
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
      toast.error("A name is required");
      return;
    }
    const price = dollarsToCents(row.price);
    if (price.error) {
      toast.error(price.error);
      return;
    }
    if (row.kind === "service") {
      const dur = parseDurationMin(row.duration);
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
            toast.success(`Added service "${row.name.trim()}"`);
            setRow(row.key, { status: "applied" });
          },
          onError: (err) => toast.error(err?.message || "Couldn't add service"),
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
            toast.success(`Added product "${row.name.trim()}"`);
            setRow(row.key, { status: "applied" });
          },
          onError: (err) => toast.error(err?.message || "Couldn't add product"),
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
            Import from a price list or menu
          </p>
          <p className="text-xs text-[#7A6254]">
            Upload a PDF or Excel/CSV — we propose a catalog you review before saving
          </p>
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
            {uploading
              ? "Uploading…"
              : enrich.isPending
                ? "Reading…"
                : "Choose a document"}
            <input
              type="file"
              accept=".pdf,.csv,.xlsx,.xls,application/pdf,text/csv"
              className="hidden"
              onChange={onFile}
              aria-label="Upload price list or menu"
            />
          </label>

          {notConfigured && (
            <p className="mt-3 text-sm text-[#7A6254]">
              Document import isn’t set up yet.
            </p>
          )}

          {rows != null && pending.length === 0 && !enrich.isPending && (
            <p className="mt-3 text-sm text-[#7A6254]">
              {rows.length === 0
                ? "Nothing to import from that file."
                : "All proposed rows handled."}
            </p>
          )}

          {pending.length > 0 && (
            <div className="mt-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#B8A99D]">
                Proposed — edit, then apply or skip
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
  return (
    <div className="rounded-xl border border-[#FFD9B3] bg-white p-3">
      <div className="mb-2 flex items-center gap-2">
        <span
          className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase"
          style={{ backgroundColor: COLORS.peach, color: COLORS.terracotta }}
        >
          {row.kind}
        </span>
        <input
          value={row.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Name"
          aria-label="Proposed name"
          className={`${cell} flex-1`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={row.price}
          onChange={(e) => onChange({ price: e.target.value })}
          placeholder="Price (e.g. 25)"
          aria-label="Proposed price"
          inputMode="decimal"
          className={`${cell} w-28`}
        />
        {row.kind === "service" && (
          <input
            value={row.duration}
            onChange={(e) => onChange({ duration: e.target.value })}
            placeholder="Mins"
            aria-label="Proposed duration"
            inputMode="numeric"
            className={`${cell} w-20`}
          />
        )}
        <input
          value={row.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Description"
          aria-label="Proposed description"
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
          Apply
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="inline-flex items-center gap-1 rounded-lg border border-[#FFD9B3] bg-[#FFF7EF] px-3 py-1.5 text-xs font-semibold text-[#7A6254]"
        >
          <X className="h-3.5 w-3.5" />
          Skip
        </button>
      </div>
    </div>
  );
}

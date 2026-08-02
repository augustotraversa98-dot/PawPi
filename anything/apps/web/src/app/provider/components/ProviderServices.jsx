import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Tag, Plus, Pencil, Ban, Power, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  useProviderServices,
  useCreateService,
  useUpdateService,
  useDeactivateService,
} from "../hooks/useProviders";
import { COLORS } from "../lib/colors";
import ImageUploader from "./ImageUploader";
import DocumentCatalogImport from "./DocumentCatalogImport";
import {
  centsToCurrency,
  centsToInput,
  dollarsToCents,
  parseDurationMin,
} from "../lib/money";

// Services management (c2b). Lists ALL of the provider's services — active AND
// inactive (inactive rows are dimmed + badged). Owner/admin can add, edit,
// deactivate (SOFT delete → active=false) and reactivate (PATCH active=true).
// These are exactly the services the owner booking screen lists, so editing here
// changes what owners can pick. Loaded inside the shell, so providerId is set.
export default function ProviderServices({ providerId }) {
  const { data: services, isLoading, isError, error } =
    useProviderServices(providerId);

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
            toast.success("Service updated");
            setEditing(null);
          },
          onError: (err) => toast.error(err?.message || "Couldn't save service"),
        },
      );
    } else {
      create.mutate(body, {
        onSuccess: () => {
          toast.success("Service added");
          setEditing(null);
        },
        onError: (err) => toast.error(err?.message || "Couldn't add service"),
      });
    }
  };

  const onDeactivate = (s) => {
    if (
      window.confirm(
        `Deactivate "${s.name}"? It will stop appearing for owners to book. Past appointments keep their service, and you can reactivate it later.`,
      )
    ) {
      deactivate.mutate(s.id, {
        onSuccess: () => toast.success("Service deactivated"),
        onError: (err) =>
          toast.error(err?.message || "Couldn't deactivate service"),
      });
    }
  };

  const onReactivate = (s) => {
    update.mutate(
      { serviceId: s.id, active: true },
      {
        onSuccess: () => toast.success("Service reactivated"),
        onError: (err) =>
          toast.error(err?.message || "Couldn't reactivate service"),
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
            <h1 className="text-2xl font-bold text-[#3B241B]">Services</h1>
            <p className="text-sm text-[#7A6254]">
              What pet owners can book with you
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
          Add service
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
            Loading services…
          </div>
        ) : isError ? (
          <div className="px-6 py-16 text-center">
            <p className="font-semibold text-[#B23B30]">
              Couldn't load services
            </p>
            <p className="mt-1 text-sm text-[#7A6254]">
              {error?.message || "Please try again."}
            </p>
          </div>
        ) : list.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-base font-semibold text-[#3B241B]">
              No services yet
            </p>
            <p className="mt-1 text-sm text-[#7A6254]">
              Add a service so pet owners can book it.
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#FFF1E2] bg-[#FFFBF6]">
                {["Service", "Duration", "Price", "Deposit", "Status", "Actions"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-[#7A6254]"
                    >
                      {h}
                    </th>
                  ),
                )}
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
                      {s.duration_min != null ? `${s.duration_min} min` : "—"}
                    </td>
                    <td className="px-4 py-3 align-top text-[#3B241B]">
                      {centsToCurrency(s.price_cents)}
                    </td>
                    <td className="px-4 py-3 align-top text-[#3B241B]">
                      {centsToCurrency(s.deposit_cents)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {inactive ? (
                        <span
                          className="inline-block rounded-full px-2.5 py-1 text-xs font-semibold"
                          style={{ backgroundColor: "#EFEAE6", color: "#7A6254" }}
                        >
                          Inactive
                        </span>
                      ) : (
                        <span
                          className="inline-block rounded-full px-2.5 py-1 text-xs font-semibold"
                          style={{ backgroundColor: "#E5F4EC", color: "#1F7A4D" }}
                        >
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap items-center gap-2">
                        <RowButton
                          label="Edit"
                          Icon={Pencil}
                          onClick={() => setEditing(s)}
                          disabled={busy}
                          variant="muted"
                        />
                        {inactive ? (
                          <RowButton
                            label="Reactivate"
                            Icon={Power}
                            onClick={() => onReactivate(s)}
                            disabled={busy}
                            variant="primary"
                          />
                        ) : (
                          <RowButton
                            label="Deactivate"
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
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-3 py-2.5 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]";

// Add / edit form in a lightweight modal. Money is entered in dollars and
// converted to integer cents on submit; numeric validation mirrors
// invalidServiceFields and blocks the mutation before any POST/PATCH fires.
function ServiceFormModal({ service, onClose, onSubmit, saving }) {
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
      price: centsToInput(service?.price_cents),
      deposit: centsToInput(service?.deposit_cents),
      payment_policy: service?.payment_policy ?? "none",
    });
    setImages(Array.isArray(service?.image_urls) ? service.image_urls : []);
  }, [service, reset]);

  const submit = (values) => {
    // Convert + validate the numeric fields up front; a bad value sets a field
    // error and returns WITHOUT calling onSubmit (so no request is made).
    const duration = parseDurationMin(values.duration_min);
    if (duration.error) {
      setError("duration_min", { type: "validate", message: duration.error });
      return;
    }
    const price = dollarsToCents(values.price);
    if (price.error) {
      setError("price", { type: "validate", message: price.error });
      return;
    }
    const deposit = dollarsToCents(values.deposit);
    if (deposit.error) {
      setError("deposit", { type: "validate", message: deposit.error });
      return;
    }

    const body = {
      name: values.name.trim(),
      description: values.description.trim(),
      duration_min: duration.value ?? null,
      price_cents: price.cents ?? null,
      deposit_cents: deposit.cents ?? null,
      payment_policy: values.payment_policy,
      image_urls: images,
    };
    onSubmit(body);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Edit service" : "Add service"}
    >
      <div className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#3B241B]">
            {isEdit ? "Edit service" : "Add service"}
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
          <Field label="Service name" error={errors.name?.message} required>
            <input
              type="text"
              placeholder="Annual checkup"
              {...register("name", {
                required: "Service name is required",
                validate: (v) =>
                  v.trim().length > 0 || "Service name is required",
              })}
              className={inputCls}
            />
          </Field>

          <Field label="Description" hint="Optional">
            <textarea
              rows={2}
              {...register("description")}
              className={`${inputCls} resize-y`}
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field
              label="Duration"
              hint="minutes"
              error={errors.duration_min?.message}
            >
              <input
                type="text"
                inputMode="numeric"
                placeholder="30"
                {...register("duration_min")}
                className={inputCls}
              />
            </Field>
            <Field label="Price" hint="$" error={errors.price?.message}>
              <input
                type="text"
                inputMode="decimal"
                placeholder="50.00"
                {...register("price")}
                className={inputCls}
              />
            </Field>
            <Field label="Deposit" hint="$" error={errors.deposit?.message}>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                {...register("deposit")}
                className={inputCls}
              />
            </Field>
          </div>

          <Field
            label="Payment for booking"
            hint="when a customer requests this service"
          >
            <select {...register("payment_policy")} className={inputCls}>
              <option value="none">No online payment — pay in person</option>
              <option value="deposit">Deposit up front (the Deposit amount)</option>
              <option value="full">Full price up front (the Price)</option>
            </select>
            <p className="mt-1 text-xs text-[#7A6254]">
              Customers pay when they request the booking. If you decline a paid
              request, they're refunded automatically.
            </p>
          </Field>

          <ImageUploader
            label="Photos"
            value={images}
            onChange={setImages}
          />

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
              {isEdit ? "Save changes" : "Add service"}
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

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useForm } from "react-hook-form";
import {
  Stethoscope,
  FileText,
  Syringe,
  ShieldCheck,
  Lock,
  RefreshCw,
  Plus,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import {
  usePetRecord,
  useRequestAccess,
  useAddVetNote,
  useAddVaccination,
} from "../hooks/useProviders";
import { COLORS } from "../lib/colors";

// Clinical record screen (c3). The ONLY provider UI that reads/writes pet MEDICAL
// data — every read/write goes through the four assertCareAccess-gated routes via
// the hooks. A 403 (no/expired/revoked grant or missing scope) is a first-class
// state: it shows the request/pending panel, never a dismissable error. Access is
// consent-based + audited server-side; that's surfaced on every state.

// The clinical screen always requests read + both write scopes so a single owner
// approval unlocks viewing, notes, and vaccinations.
const CLINICAL_SCOPES = ["medical_read", "medical_write", "vaccinations_write"];

const CONSENT_LINE =
  "Access is granted by the pet's owner and can be revoked anytime. Every view and entry is logged.";

function fmtDate(d) {
  return d ? String(d).slice(0, 10) : "—";
}

export default function ProviderPetRecord({
  providerId,
  petId,
  bookingId,
  petName,
}) {
  const record = usePetRecord(providerId, petId);
  const requestAccess = useRequestAccess(providerId);
  const addNote = useAddVetNote(providerId, petId);
  const addVaccination = useAddVaccination(providerId, petId);

  // A request has been sent and is awaiting the owner's approval.
  const [requested, setRequested] = useState(false);
  // Whether the record was EVER granted this session — distinguishes a first-time
  // request ("ask the owner") from a mid-session revoke ("owner revoked access").
  const hadAccess = useRef(false);

  const isForbidden = record.isError && record.error?.status === 403;
  const granted = !isForbidden && !!record.data;

  useEffect(() => {
    if (granted) hadAccess.current = true;
  }, [granted]);

  const name = petName || "this pet";

  // A write that 403s mid-session means the owner revoked access — refetch (which
  // will now 403) and drop back to the request panel rather than show stale data.
  const handleWriteError = (err, fallbackMsg) => {
    if (err?.status === 403) {
      setRequested(false);
      toast.error("Access was revoked by the owner");
      record.refetch();
      return;
    }
    toast.error(err?.message || fallbackMsg);
  };

  const onRequest = () => {
    requestAccess.mutate(
      {
        petId,
        scopes: CLINICAL_SCOPES,
        bookingId: bookingId ?? undefined,
      },
      {
        onSuccess: () => {
          setRequested(true);
          toast.success("Access requested");
        },
        onError: (err) => {
          // 409 = a grant is already pending/active — not a failure; treat it as
          // "requested" so the owner just needs to approve (or it's already live).
          if (err?.status === 409) {
            setRequested(true);
            toast.success("Access already requested — waiting for approval");
            record.refetch();
            return;
          }
          toast.error(err?.message || "Couldn't request access");
        },
      },
    );
  };

  return (
    <div className="px-8 py-7">
      <div className="mb-2">
        <Link
          to="/provider/bookings"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#7A6254] hover:text-[#3B241B]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to bookings
        </Link>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: COLORS.peach }}
        >
          <Stethoscope className="h-5 w-5" style={{ color: COLORS.terracotta }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#3B241B]">
            Clinical record — {name}
          </h1>
          <p className="flex items-center gap-1.5 text-sm text-[#7A6254]">
            <ShieldCheck className="h-3.5 w-3.5" style={{ color: "#1F7A4D" }} />
            {CONSENT_LINE}
          </p>
        </div>
      </div>

      {record.isLoading ? (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-[#FFD9B3] bg-white px-6 py-16 text-[#7A6254]">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: COLORS.coral }} />
          Loading record…
        </div>
      ) : isForbidden ? (
        <AccessPanel
          name={name}
          requested={requested}
          wasRevoked={hadAccess.current}
          onRequest={onRequest}
          onRefresh={() => {
            setRequested(false);
            record.refetch();
          }}
          requesting={requestAccess.isPending}
          refreshing={record.isFetching}
        />
      ) : record.isError ? (
        <div className="rounded-2xl border border-[#FFD9B3] bg-white px-6 py-16 text-center">
          <p className="font-semibold text-[#B23B30]">Couldn't load the record</p>
          <p className="mt-1 text-sm text-[#7A6254]">
            {record.error?.message || "Please try again."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <MedicalProfileCard profile={record.data.medical_profile} />
          <VetNotesCard
            notes={record.data.notes ?? []}
            addNote={addNote}
            onWriteError={handleWriteError}
          />
          <VaccinationsCard
            vaccinations={record.data.vaccinations ?? []}
            addVaccination={addVaccination}
            onWriteError={handleWriteError}
          />
        </div>
      )}
    </div>
  );
}

// 403 state: either "request access" (never had it) or "access revoked" (had it
// this session), plus the "requested — waiting for approval" pending state. The
// owner approves on THEIR app (mobile); approval is instantly effective on Refresh.
function AccessPanel({
  name,
  requested,
  wasRevoked,
  onRequest,
  onRefresh,
  requesting,
  refreshing,
}) {
  if (requested) {
    return (
      <div className="rounded-2xl border border-[#FFD9B3] bg-white px-6 py-12 text-center">
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ backgroundColor: COLORS.peach }}
        >
          <RefreshCw className="h-6 w-6" style={{ color: COLORS.terracotta }} />
        </div>
        <h2 className="text-lg font-bold text-[#3B241B]">
          Access requested — waiting for the owner to approve
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[#7A6254]">
          {name}'s owner approves clinical access from their PawPi app. Approval is
          effective immediately — refresh once they've granted it.
        </p>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-60"
          style={{ backgroundColor: COLORS.coral }}
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#FFD9B3] bg-white px-6 py-12 text-center">
      <div
        className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{ backgroundColor: COLORS.peach }}
      >
        <Lock className="h-6 w-6" style={{ color: COLORS.terracotta }} />
      </div>
      <h2 className="text-lg font-bold text-[#3B241B]">
        {wasRevoked
          ? `Access to ${name}'s record was revoked`
          : `Request clinical access for ${name}`}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-[#7A6254]">
        {wasRevoked
          ? "The owner revoked access. You can request it again — they'll need to approve from their app."
          : "You don't have access to this pet's medical record yet. Requesting sends the owner an approval in their PawPi app; once they approve, you can view and add notes and vaccinations."}
      </p>
      <button
        type="button"
        onClick={onRequest}
        disabled={requesting}
        className="mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-60"
        style={{ backgroundColor: COLORS.coral }}
      >
        {requesting && <Loader2 className="h-4 w-4 animate-spin" />}
        {wasRevoked ? "Request access again" : "Request access"}
      </button>
    </div>
  );
}

const PROFILE_FIELDS = [
  ["microchip_id", "Microchip ID"],
  ["spayed_neutered_status", "Spayed / neutered"],
  ["primary_vet_name", "Primary vet"],
  ["primary_clinic_name", "Primary clinic"],
  ["vet_phone", "Vet phone"],
  ["medical_notes", "Medical notes"],
];

function MedicalProfileCard({ profile }) {
  const present = profile
    ? PROFILE_FIELDS.filter(([k]) => profile[k] != null && profile[k] !== "")
    : [];
  return (
    <SectionCard Icon={FileText} title="Medical profile">
      {!profile || present.length === 0 ? (
        <p className="px-1 py-2 text-sm text-[#7A6254]">
          No medical profile on file for this pet yet.
        </p>
      ) : (
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {present.map(([k, label]) => (
            <div key={k}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[#B8A99D]">
                {label}
              </dt>
              <dd className="mt-0.5 text-sm text-[#3B241B]">{profile[k]}</dd>
            </div>
          ))}
        </dl>
      )}
    </SectionCard>
  );
}

function VetNotesCard({ notes, addNote, onWriteError }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ defaultValues: { note: "", note_date: "" } });

  const submit = (values) => {
    const body = { note: values.note.trim() };
    if (values.note_date) body.note_date = values.note_date;
    addNote.mutate(body, {
      onSuccess: () => {
        toast.success("Note added");
        reset({ note: "", note_date: "" });
      },
      onError: (err) => onWriteError(err, "Couldn't add note"),
    });
  };

  return (
    <SectionCard Icon={Stethoscope} title="Vet notes">
      <form
        onSubmit={handleSubmit(submit)}
        className="mb-5 rounded-xl border border-[#FFE6CC] bg-[#FFFBF6] p-4"
      >
        <div className="flex flex-col gap-3">
          <div>
            <label
              htmlFor="note-text"
              className="mb-1 block text-sm font-semibold text-[#3B241B]"
            >
              Add a note <span style={{ color: COLORS.coral }}>*</span>
            </label>
            <textarea
              id="note-text"
              rows={2}
              placeholder="Exam findings, plan, observations…"
              {...register("note", {
                required: "Note is required",
                validate: (v) => v.trim().length > 0 || "Note is required",
              })}
              className="w-full resize-y rounded-xl border-2 border-[#FFD9B3] bg-white px-3 py-2.5 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]"
            />
            {errors.note && (
              <p className="mt-1 text-xs font-semibold text-[#B23B30]">
                {errors.note.message}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label
                htmlFor="note-date"
                className="mb-1 block text-xs font-semibold text-[#7A6254]"
              >
                Date (optional)
              </label>
              <input
                id="note-date"
                type="date"
                {...register("note_date")}
                className="rounded-xl border-2 border-[#FFD9B3] bg-white px-3 py-2 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]"
              />
            </div>
            <button
              type="submit"
              disabled={addNote.isPending}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: COLORS.coral }}
            >
              {addNote.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add note
            </button>
          </div>
        </div>
      </form>

      {notes.length === 0 ? (
        <p className="px-1 py-2 text-sm text-[#7A6254]">No vet notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded-xl border border-[#FFF1E2] bg-white p-4"
            >
              <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#7A6254]">
                <span className="font-semibold text-[#3B241B]">
                  {fmtDate(n.note_date)}
                </span>
                {n.vet_name && <span>· {n.vet_name}</span>}
                {n.appointment_id != null && (
                  <span className="rounded-full bg-[#FFF1E2] px-2 py-0.5 font-semibold text-[#B75D32]">
                    Booking #{n.appointment_id}
                  </span>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm text-[#3B241B]">
                {n.note}
              </p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function VaccinationsCard({ vaccinations, addVaccination, onWriteError }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: { name: "", date_given: "", expires_on: "", lot: "" },
  });

  const submit = (values) => {
    const body = { name: values.name.trim() };
    if (values.date_given) body.date_given = values.date_given;
    if (values.expires_on) body.expires_on = values.expires_on;
    if (values.lot.trim()) body.lot = values.lot.trim();
    addVaccination.mutate(body, {
      onSuccess: () => {
        toast.success("Vaccination added");
        reset({ name: "", date_given: "", expires_on: "", lot: "" });
      },
      onError: (err) => onWriteError(err, "Couldn't add vaccination"),
    });
  };

  return (
    <SectionCard Icon={Syringe} title="Vaccinations">
      <p className="mb-3 text-xs text-[#B8A99D]">
        Vaccinations you add here write to the pet's record and are visible to the
        owner in their app.
      </p>
      <form
        onSubmit={handleSubmit(submit)}
        className="mb-5 rounded-xl border border-[#FFE6CC] bg-[#FFFBF6] p-4"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1">
            <label
              htmlFor="vax-name"
              className="mb-1 block text-sm font-semibold text-[#3B241B]"
            >
              Vaccine <span style={{ color: COLORS.coral }}>*</span>
            </label>
            <input
              id="vax-name"
              type="text"
              placeholder="Rabies"
              {...register("name", {
                required: "Vaccine name is required",
                validate: (v) => v.trim().length > 0 || "Vaccine name is required",
              })}
              className="w-full rounded-xl border-2 border-[#FFD9B3] bg-white px-3 py-2.5 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]"
            />
            {errors.name && (
              <p className="mt-1 text-xs font-semibold text-[#B23B30]">
                {errors.name.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="vax-given"
              className="mb-1 block text-xs font-semibold text-[#7A6254]"
            >
              Date given
            </label>
            <input
              id="vax-given"
              type="date"
              {...register("date_given")}
              className="rounded-xl border-2 border-[#FFD9B3] bg-white px-3 py-2 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]"
            />
          </div>
          <div>
            <label
              htmlFor="vax-expires"
              className="mb-1 block text-xs font-semibold text-[#7A6254]"
            >
              Expires
            </label>
            <input
              id="vax-expires"
              type="date"
              {...register("expires_on")}
              className="rounded-xl border-2 border-[#FFD9B3] bg-white px-3 py-2 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]"
            />
          </div>
          <div>
            <label
              htmlFor="vax-lot"
              className="mb-1 block text-xs font-semibold text-[#7A6254]"
            >
              Lot
            </label>
            <input
              id="vax-lot"
              type="text"
              placeholder="Lot #"
              {...register("lot")}
              className="w-28 rounded-xl border-2 border-[#FFD9B3] bg-white px-3 py-2 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]"
            />
          </div>
          <button
            type="submit"
            disabled={addVaccination.isPending}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: COLORS.coral }}
          >
            {addVaccination.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add vaccination
          </button>
        </div>
      </form>

      {vaccinations.length === 0 ? (
        <p className="px-1 py-2 text-sm text-[#7A6254]">
          No vaccinations on record yet.
        </p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[#FFF1E2] bg-[#FFFBF6]">
              {["Vaccine", "Given", "Expires", "Lot"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-[#7A6254]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vaccinations.map((v) => (
              <tr
                key={v.id}
                className="border-b border-[#FFF7EF] last:border-0"
              >
                <td className="px-4 py-2.5 font-semibold text-[#3B241B]">
                  {v.name}
                </td>
                <td className="px-4 py-2.5 text-[#3B241B]">
                  {fmtDate(v.date_given)}
                </td>
                <td className="px-4 py-2.5 text-[#3B241B]">
                  {fmtDate(v.expires_on)}
                </td>
                <td className="px-4 py-2.5 text-[#7A6254]">{v.lot || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionCard>
  );
}

function SectionCard({ Icon, title, children }) {
  return (
    <section className="rounded-2xl border border-[#FFD9B3] bg-white p-6">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4" style={{ color: COLORS.terracotta }} />
        <h2 className="text-base font-bold text-[#3B241B]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

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
  Phone,
  Shield,
  Paperclip,
  Camera,
  FlaskConical,
} from "lucide-react";
import { toast } from "sonner";
import {
  usePetRecord,
  useRequestAccess,
  useAddVetNote,
  useAddVaccination,
  useEditVetNote,
  useAddLabResult,
  useAddDocument,
} from "../hooks/useProviders";
import { DocumentForm, EditableNoteBody, LabResultForm } from "./RecordWriteForms";
import { COLORS } from "../lib/colors";
import recordCopy from "../i18n/record";
import { useProviderCopy } from "../i18n/lib/useProviderCopy";
import { fill } from "../i18n/lib/format";
import { serverErrorMessage } from "../i18n/lib/serverError";
import { formatRecordDate, linkAuthorName, recordFileHref } from "../lib/record";

// Clinical record screen (c3). The ONLY provider UI that reads/writes pet MEDICAL
// data — every read/write goes through the four assertCareAccess-gated routes via
// the hooks. A 403 (no/expired/revoked grant or missing scope) is a first-class
// state: it shows the request/pending panel, never a dismissable error. Access is
// consent-based + audited server-side; that's surfaced on every state.
//
// When the record answers with `sharedSections` (the owner shared by section),
// only those sections are shown and the rest are named as not shared. There is a
// write form only for the parts in `editSections`, the ones the owner lets this
// business add to; none of them is the default. Nothing is ever deleted here.

// The clinical screen always requests read + both write scopes so a single owner
// approval unlocks viewing, notes, and vaccinations.
const CLINICAL_SCOPES = ["medical_read", "medical_write", "vaccinations_write"];

// The order sections are listed in (the server's section keys).
const SECTIONS = [
  "profile",
  "emergency_contact",
  "insurance",
  "vet_notes",
  "vaccines",
  "files",
  "photos",
  "lab_results",
];

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
  const editNote = useEditVetNote(providerId, petId);
  const addLabResult = useAddLabResult(providerId, petId);
  const addDocument = useAddDocument(providerId, petId);
  const { t, lang } = useProviderCopy(recordCopy);

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

  const name = petName || t.thisPet;
  const sharedSections = record.data?.sharedSections ?? null;

  // A write that 403s mid-session means the owner revoked access — refetch (which
  // will now 403) and drop back to the request panel rather than show stale data.
  const handleWriteError = (err, fallbackMsg) => {
    if (err?.status === 403) {
      setRequested(false);
      toast.error(t.toast.revoked);
      record.refetch();
      return;
    }
    toast.error(serverErrorMessage(err, lang, fallbackMsg, recordCopy));
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
          toast.success(t.toast.requested);
        },
        onError: (err) => {
          // 409 = a grant is already pending/active — not a failure; treat it as
          // "requested" so the owner just needs to approve (or it's already live).
          if (err?.status === 409) {
            setRequested(true);
            toast.success(t.toast.alreadyRequested);
            record.refetch();
            return;
          }
          toast.error(serverErrorMessage(err, lang, t.toast.requestFailed, recordCopy));
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
          {t.back}
        </Link>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: COLORS.peach }}
        >
          <Stethoscope
            className="h-5 w-5"
            style={{ color: COLORS.terracotta }}
          />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#3B241B]">
            {fill(t.title, { name })}
          </h1>
          <p className="flex items-center gap-1.5 text-sm text-[#7A6254]">
            <ShieldCheck className="h-3.5 w-3.5" style={{ color: "#1F7A4D" }} />
            {t.consent}
          </p>
        </div>
      </div>

      {record.isLoading ? (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-[#FFD9B3] bg-white px-6 py-16 text-[#7A6254]">
          <Loader2
            className="h-5 w-5 animate-spin"
            style={{ color: COLORS.coral }}
          />
          {t.loading}
        </div>
      ) : isForbidden ? (
        <AccessPanel
          t={t}
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
          <p className="font-semibold text-[#B23B30]">{t.loadErrorTitle}</p>
          <p className="mt-1 text-sm text-[#7A6254]">
            {serverErrorMessage(record.error, lang, t.tryAgain, recordCopy)}
          </p>
        </div>
      ) : sharedSections ? (
        <SharedRecord
          t={t}
          lang={lang}
          providerId={providerId}
          data={record.data}
          sharedSections={sharedSections}
          writes={{ addNote, addVaccination, editNote, addLabResult, addDocument }}
          onWriteError={handleWriteError}
        />
      ) : (
        <div className="space-y-6">
          <MedicalProfileCard
            t={t}
            lang={lang}
            profile={record.data.medical_profile}
          />
          <VetNotesCard
            t={t}
            lang={lang}
            notes={record.data.notes ?? []}
            addNote={addNote}
            editNote={editNote}
            onWriteError={handleWriteError}
          />
          <VaccinationsCard
            t={t}
            lang={lang}
            vaccinations={record.data.vaccinations ?? []}
            addVaccination={addVaccination}
            onWriteError={handleWriteError}
          />
        </div>
      )}
    </div>
  );
}

// Marks what someone added through a record link, so it is never read as a clinic's or the owner's entry.
function FromLink({ t, row }) {
  if (!row.via_record_link) return null;
  return (
    <span className="ml-0 mt-1 inline-block rounded-full bg-[#FFF1E2] px-2 py-0.5 text-xs font-semibold text-[#B75D32]">
      {fill(t.fromLink, { name: linkAuthorName(row, t) })}
    </span>
  );
}

// 403 state: either "request access" (never had it) or "access revoked" (had it
// this session), plus the "requested — waiting for approval" pending state. The
// owner approves on THEIR app (mobile); approval is instantly effective on Refresh.
function AccessPanel({
  t,
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
          {t.access.requestedTitle}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[#7A6254]">
          {fill(t.access.requestedBody, { name })}
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
          {t.access.refresh}
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
        {fill(wasRevoked ? t.access.endedTitle : t.access.requestTitle, {
          name,
        })}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-[#7A6254]">
        {wasRevoked ? t.access.endedBody : t.access.requestBody}
      </p>
      <button
        type="button"
        onClick={onRequest}
        disabled={requesting}
        className="mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-60"
        style={{ backgroundColor: COLORS.coral }}
      >
        {requesting && <Loader2 className="h-4 w-4 animate-spin" />}
        {wasRevoked ? t.access.requestAgain : t.access.request}
      </button>
    </div>
  );
}

const PROFILE_FIELDS = [
  "microchip_id",
  "spayed_neutered_status",
  "primary_vet_name",
  "primary_clinic_name",
  "vet_phone",
  "medical_notes",
];

// A section shared by itself carries every column that belongs to it.
const SHARED_PROFILE_FIELDS = [
  "microchip_id",
  "spayed_neutered_status",
  "spayed_neutered_date",
  "primary_vet_name",
  "primary_clinic_name",
  "vet_phone",
  "vet_email",
  "medical_notes",
];

function MedicalProfileCard({ t, lang, profile, fields = PROFILE_FIELDS }) {
  const show = (key) => {
    const value = profile[key];
    if (key === "spayed_neutered_status") return t.spayValues[value] ?? value;
    if (key === "spayed_neutered_date") return formatRecordDate(value, lang);
    return value;
  };
  return (
    <FieldsCard
      Icon={FileText}
      title={t.sections.profile}
      empty={t.profile.empty}
      labels={t.profile}
      fields={fields}
      values={profile}
      show={show}
    />
  );
}

// A card of labelled values from one row; blank values are left out.
function FieldsCard({ Icon, title, empty, labels, fields, values, show }) {
  const present = values
    ? fields.filter((k) => values[k] != null && values[k] !== "")
    : [];
  return (
    <SectionCard Icon={Icon} title={title}>
      {present.length === 0 ? (
        <EmptyLine text={empty} />
      ) : (
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {present.map((k) => (
            <div key={k}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[#B8A99D]">
                {labels[k]}
              </dt>
              <dd className="mt-0.5 text-sm text-[#3B241B]">
                {show ? show(k) : values[k]}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </SectionCard>
  );
}

function EmptyLine({ text }) {
  return <p className="px-1 py-2 text-sm text-[#7A6254]">{text}</p>;
}

// What a grant by section shows: the shared sections only and the names of the
// ones that were not shared. A section is read only unless the owner lets this
// business add to it.
function SharedRecord({ t, lang, providerId, data, sharedSections, writes, onWriteError }) {
  const has = (section) => sharedSections.includes(section);
  const mayAdd = (section) => has(section) && !!data.editSections?.includes(section);
  const names = (list) => list.map((s) => t.sections[s]).join(" · ");
  const notShared = SECTIONS.filter((s) => !has(s));
  const addable = SECTIONS.filter(mayAdd);
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#FFD9B3] bg-[#FFFBF6] p-5 text-sm text-[#7A6254]">
        <p className="font-bold text-[#3B241B]">{t.shared.title}</p>
        <p className="mt-1" data-testid="shared-access">
          {addable.length > 0
            ? fill(t.shared.canAdd, { parts: names(addable) })
            : t.shared.readOnly}
        </p>
        <p className="mt-3">
          <span className="font-semibold text-[#3B241B]">
            {t.shared.shared}:{" "}
          </span>
          <span data-testid="shared-sections">
            {names(SECTIONS.filter(has))}
          </span>
        </p>
        {notShared.length > 0 && (
          <p className="mt-1">
            <span className="font-semibold text-[#3B241B]">
              {t.shared.notShared}:{" "}
            </span>
            <span data-testid="not-shared-sections">{names(notShared)}</span>
          </p>
        )}
      </div>

      {has("profile") && (
        <MedicalProfileCard
          t={t}
          lang={lang}
          profile={data.medical_profile}
          fields={SHARED_PROFILE_FIELDS}
        />
      )}
      {has("emergency_contact") && (
        <FieldsCard
          Icon={Phone}
          title={t.sections.emergency_contact}
          empty={t.emergencyContact.empty}
          labels={t.emergencyContact}
          fields={["emergency_contact_name", "emergency_contact_phone"]}
          values={data.medical_profile}
        />
      )}
      {has("insurance") && (
        <FieldsCard
          Icon={Shield}
          title={t.sections.insurance}
          empty={t.insurance.empty}
          labels={t.insurance}
          fields={["insurance_provider", "insurance_policy_number"]}
          values={data.medical_profile}
        />
      )}
      {has("vet_notes") && (
        <VetNotesCard
          t={t}
          lang={lang}
          notes={data.notes ?? []}
          readOnly={!mayAdd("vet_notes")}
          addNote={writes.addNote}
          editNote={mayAdd("vet_notes") ? writes.editNote : undefined}
          onWriteError={onWriteError}
        />
      )}
      {has("vaccines") && (
        <VaccinationsCard
          t={t}
          lang={lang}
          vaccinations={data.vaccinations ?? []}
          readOnly={!mayAdd("vaccines")}
          addVaccination={writes.addVaccination}
          onWriteError={onWriteError}
        />
      )}
      {has("files") && (
        <FilesCard
          t={t}
          lang={lang}
          providerId={providerId}
          documents={data.documents ?? []}
          form={
            mayAdd("files") && (
              <DocumentForm t={t} addDocument={writes.addDocument} onWriteError={onWriteError} />
            )
          }
        />
      )}
      {has("photos") && (
        <PhotosCard
          t={t}
          lang={lang}
          providerId={providerId}
          photos={data.photo_checks ?? []}
        />
      )}
      {has("lab_results") && (
        <LabResultsCard
          t={t}
          lang={lang}
          results={data.lab_results ?? []}
          form={
            mayAdd("lab_results") && (
              <LabResultForm t={t} addLabResult={writes.addLabResult} onWriteError={onWriteError} />
            )
          }
        />
      )}
    </div>
  );
}

function FilesCard({ t, lang, providerId, documents, form }) {
  return (
    <SectionCard Icon={Paperclip} title={t.sections.files}>
      {form}
      {documents.length === 0 ? (
        <EmptyLine text={t.files.empty} />
      ) : (
        <ul className="space-y-3">
          {documents.map((d) => {
            const href = recordFileHref(d.file_url, providerId);
            return (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#FFF1E2] bg-white p-4"
              >
                <div>
                  <p className="text-sm font-semibold text-[#3B241B]">
                    {d.name}
                  </p>
                  <p className="text-xs text-[#7A6254]">
                    {[
                      d.document_type,
                      d.document_date &&
                        formatRecordDate(d.document_date, lang),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {d.notes && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[#3B241B]">
                      {d.notes}
                    </p>
                  )}
                  <FromLink t={t} row={d} />
                </div>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-bold text-[#B75D32] hover:underline"
                  >
                    {t.files.open}
                  </a>
                ) : (
                  <span className="text-xs text-[#B8A99D]">
                    {t.files.unavailable}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

function PhotosCard({ t, lang, providerId, photos }) {
  return (
    <SectionCard Icon={Camera} title={t.sections.photos}>
      {photos.length === 0 ? (
        <EmptyLine text={t.photos.empty} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-3">
          {photos.map((p) => {
            const href = recordFileHref(p.image_url, providerId);
            const area = t.photos.areas[p.body_area] ?? p.body_area;
            return (
              <li
                key={p.id}
                className="rounded-xl border border-[#FFF1E2] bg-white p-3"
              >
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    <img
                      src={href}
                      alt={area}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-40 w-full rounded-lg object-cover"
                    />
                  </a>
                ) : (
                  <p className="text-xs text-[#B8A99D]">
                    {t.files.unavailable}
                  </p>
                )}
                <p className="mt-2 text-sm font-semibold text-[#3B241B]">
                  {area}
                </p>
                <p className="text-xs text-[#7A6254]">
                  {formatRecordDate(p.created_at, lang)}
                </p>
                {p.notes && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-[#3B241B]">
                    {p.notes}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

function LabResultsCard({ t, lang, results, form }) {
  return (
    <SectionCard Icon={FlaskConical} title={t.sections.lab_results}>
      {form}
      {results.length === 0 ? (
        <EmptyLine text={t.labResults.empty} />
      ) : (
        <ul className="space-y-3">
          {results.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-[#FFF1E2] bg-white p-4"
            >
              <p className="text-sm font-semibold text-[#3B241B]">
                {r.test_name}
              </p>
              <p className="text-xs text-[#7A6254]">
                {[
                  formatRecordDate(r.test_date, lang),
                  r.ordered_by &&
                    fill(t.labResults.orderedBy, { name: r.ordered_by }),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {r.results && (
                <p className="mt-1 whitespace-pre-wrap text-sm text-[#3B241B]">
                  {r.results}
                </p>
              )}
              {r.notes && (
                <p className="mt-1 whitespace-pre-wrap text-sm text-[#7A6254]">
                  {r.notes}
                </p>
              )}
              <FromLink t={t} row={r} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// Who added a note through a record link: their name, or that it was someone with no account.
function linkNoteAuthor(note, t) {
  return linkAuthorName(note, t);
}

function VetNotesCard({ t, lang, notes, addNote, editNote, onWriteError, readOnly }) {
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
        toast.success(t.toast.noteAdded);
        reset({ note: "", note_date: "" });
      },
      onError: (err) => onWriteError(err, t.toast.noteFailed),
    });
  };

  return (
    <SectionCard Icon={Stethoscope} title={t.sections.vet_notes}>
      {!readOnly && (
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
                {t.notes.addLabel}{" "}
                <span style={{ color: COLORS.coral }}>*</span>
              </label>
              <textarea
                id="note-text"
                rows={2}
                placeholder={t.notes.placeholder}
                {...register("note", {
                  required: true,
                  validate: (v) => v.trim().length > 0,
                })}
                className="w-full resize-y rounded-xl border-2 border-[#FFD9B3] bg-white px-3 py-2.5 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]"
              />
              {errors.note && (
                <p className="mt-1 text-xs font-semibold text-[#B23B30]">
                  {t.notes.required}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label
                  htmlFor="note-date"
                  className="mb-1 block text-xs font-semibold text-[#7A6254]"
                >
                  {t.notes.date}
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
                {t.notes.add}
              </button>
            </div>
          </div>
        </form>
      )}

      {notes.length === 0 ? (
        <EmptyLine text={t.notes.empty} />
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded-xl border border-[#FFF1E2] bg-white p-4"
            >
              <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#7A6254]">
                <span className="font-semibold text-[#3B241B]">
                  {formatRecordDate(n.note_date, lang)}
                </span>
                {n.via_record_link ? (
                  <>
                    <span>· {linkNoteAuthor(n, t)}</span>
                    <span className="rounded-full bg-[#FFF1E2] px-2 py-0.5 font-semibold text-[#B75D32]">
                      {t.notes.viaLink}
                    </span>
                  </>
                ) : (
                  n.vet_name && <span>· {n.vet_name}</span>
                )}
                {n.vet_edited_at && (
                  <span>· {fill(t.notes.edited, { date: formatRecordDate(n.vet_edited_at, lang) })}</span>
                )}
                {n.appointment_id != null && (
                  <span className="rounded-full bg-[#FFF1E2] px-2 py-0.5 font-semibold text-[#B75D32]">
                    {fill(t.notes.booking, { id: n.appointment_id })}
                  </span>
                )}
              </div>
              <EditableNoteBody t={t} note={n} editNote={editNote} onWriteError={onWriteError} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function VaccinationsCard({
  t,
  lang,
  vaccinations,
  addVaccination,
  onWriteError,
  readOnly,
}) {
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
        toast.success(t.toast.vaccinationAdded);
        reset({ name: "", date_given: "", expires_on: "", lot: "" });
      },
      onError: (err) => onWriteError(err, t.toast.vaccinationFailed),
    });
  };

  return (
    <SectionCard Icon={Syringe} title={t.sections.vaccines}>
      {!readOnly && (
        <>
          <p className="mb-3 text-xs text-[#B8A99D]">
            {t.vaccinations.writeHint}
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
                  {t.vaccinations.vaccine}{" "}
                  <span style={{ color: COLORS.coral }}>*</span>
                </label>
                <input
                  id="vax-name"
                  type="text"
                  placeholder={t.vaccinations.placeholder}
                  {...register("name", {
                    required: true,
                    validate: (v) => v.trim().length > 0,
                  })}
                  className="w-full rounded-xl border-2 border-[#FFD9B3] bg-white px-3 py-2.5 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]"
                />
                {errors.name && (
                  <p className="mt-1 text-xs font-semibold text-[#B23B30]">
                    {t.vaccinations.required}
                  </p>
                )}
              </div>
              <div>
                <label
                  htmlFor="vax-given"
                  className="mb-1 block text-xs font-semibold text-[#7A6254]"
                >
                  {t.vaccinations.dateGiven}
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
                  {t.vaccinations.expires}
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
                  {t.vaccinations.lot}
                </label>
                <input
                  id="vax-lot"
                  type="text"
                  placeholder={t.vaccinations.lotPlaceholder}
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
                {t.vaccinations.add}
              </button>
            </div>
          </form>
        </>
      )}

      {vaccinations.length === 0 ? (
        <EmptyLine text={t.vaccinations.empty} />
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[#FFF1E2] bg-[#FFFBF6]">
              {[
                t.vaccinations.vaccine,
                t.vaccinations.given,
                t.vaccinations.expires,
                t.vaccinations.lot,
              ].map((h) => (
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
                  {v.via_record_link && (
                    <span className="block">
                      <FromLink t={t} row={v} />
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-[#3B241B]">
                  {formatRecordDate(v.date_given, lang)}
                </td>
                <td className="px-4 py-2.5 text-[#3B241B]">
                  {formatRecordDate(v.expires_on, lang)}
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

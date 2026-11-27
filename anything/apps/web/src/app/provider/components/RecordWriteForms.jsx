import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { COLORS } from "../lib/colors";

// The forms a business uses to add to a record the owner lets it add to (ProviderPetRecord): a lab result, a document,
// and the correction of a note it wrote. Each is drawn only when the access allows it; the server decides again.

const input =
  "w-full rounded-xl border-2 border-[#FFD9B3] bg-white px-3 py-2 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]";
const label = "mb-1 block text-xs font-semibold text-[#7A6254]";
const box = "mb-5 rounded-xl border border-[#FFE6CC] bg-[#FFFBF6] p-4";
const DOCUMENT_CATEGORIES = ["lab", "vaccine", "visit", "invoice", "other"];
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

function SubmitButton({ pending, children }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-60"
      style={{ backgroundColor: COLORS.coral }}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      {children}
    </button>
  );
}

function Field({ id, name, wide, children }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label htmlFor={id} className={label}>
        {name}
      </label>
      {children}
    </div>
  );
}

const filled = (values) =>
  Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])
      .filter(([, value]) => value),
  );

export function LabResultForm({ t, addLabResult, onWriteError }) {
  const { register, handleSubmit, reset, formState } = useForm({
    defaultValues: { test_name: "", test_date: "", results: "", ordered_by: "", notes: "" },
  });
  const invalid = formState.errors.test_name || formState.errors.test_date;
  const required = { required: true, validate: (v) => v.trim().length > 0 };

  const submit = (values) =>
    addLabResult.mutate(filled(values), {
      onSuccess: () => {
        toast.success(t.toast.labAdded);
        reset();
      },
      onError: (err) => onWriteError(err, t.toast.labFailed),
    });

  return (
    <form onSubmit={handleSubmit(submit)} className={box} aria-label={t.labResults.add} noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="lab-name" name={`${t.labResults.testName} *`}>
          <input id="lab-name" type="text" maxLength={200} className={input} {...register("test_name", required)} />
        </Field>
        <Field id="lab-date" name={`${t.labResults.testDate} *`}>
          <input id="lab-date" type="date" className={input} {...register("test_date", required)} />
        </Field>
        <Field id="lab-results" name={t.labResults.results} wide>
          <textarea id="lab-results" rows={3} maxLength={5000} className={input} {...register("results")} />
        </Field>
        <Field id="lab-ordered" name={t.labResults.orderedByLabel}>
          <input id="lab-ordered" type="text" maxLength={200} className={input} {...register("ordered_by")} />
        </Field>
        <Field id="lab-notes" name={t.labResults.notes}>
          <input id="lab-notes" type="text" maxLength={2000} className={input} {...register("notes")} />
        </Field>
      </div>
      {invalid && <p className="mt-2 text-xs font-semibold text-[#B23B30]">{t.labResults.required}</p>}
      <div className="mt-3">
        <SubmitButton pending={addLabResult.isPending}>{t.labResults.add}</SubmitButton>
      </div>
    </form>
  );
}

export function DocumentForm({ t, addDocument, onWriteError }) {
  const empty = { name: "", category: "lab", document_date: "", notes: "" };
  const [values, setValues] = useState(empty);
  const [file, setFile] = useState(null);
  const [problem, setProblem] = useState(null); // a key of t.files
  const picker = useRef(null);
  const set = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));

  const submit = (event) => {
    event.preventDefault();
    if (!file || !values.name.trim()) return setProblem("required");
    if (file.size > MAX_DOCUMENT_BYTES) return setProblem("tooLarge");
    setProblem(null);
    const form = new FormData();
    for (const [key, value] of Object.entries(filled(values))) form.append(key, value);
    form.append("file", file);
    addDocument.mutate(form, {
      onSuccess: () => {
        toast.success(t.toast.documentAdded);
        setValues(empty);
        setFile(null);
        if (picker.current) picker.current.value = "";
      },
      onError: (err) => {
        if (err?.code === "file_type") return setProblem("fileType");
        if (err?.code === "file_too_large") return setProblem("tooLarge");
        return onWriteError(err, t.toast.documentFailed);
      },
    });
  };

  return (
    <form onSubmit={submit} className={box} aria-label={t.files.add} noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="doc-file" name={`${t.files.file} *`} wide>
          <input
            id="doc-file"
            ref={picker}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="block w-full text-sm text-[#3B241B]"
          />
          <p className="mt-1 text-xs text-[#7A6254]">{t.files.hint}</p>
        </Field>
        <Field id="doc-name" name={`${t.files.name} *`}>
          <input id="doc-name" type="text" maxLength={200} value={values.name} onChange={set("name")} className={input} />
        </Field>
        <Field id="doc-category" name={t.files.category}>
          <select id="doc-category" value={values.category} onChange={set("category")} className={input}>
            {DOCUMENT_CATEGORIES.map((key) => (
              <option key={key} value={key}>
                {t.files.categories[key]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="doc-date" name={t.files.date}>
          <input id="doc-date" type="date" value={values.document_date} onChange={set("document_date")} className={input} />
        </Field>
        <Field id="doc-notes" name={t.files.notes}>
          <input id="doc-notes" type="text" maxLength={2000} value={values.notes} onChange={set("notes")} className={input} />
        </Field>
      </div>
      {problem && (
        <p role="status" className="mt-2 text-xs font-semibold text-[#B23B30]">
          {t.files[problem]}
        </p>
      )}
      <div className="mt-3">
        <SubmitButton pending={addDocument.isPending}>{t.files.add}</SubmitButton>
      </div>
    </form>
  );
}

// A note this business wrote: shown, and corrected in place.
export function EditableNoteBody({ t, note, editNote, onWriteError }) {
  const [draft, setDraft] = useState(null); // null = not editing

  if (draft === null) {
    return (
      <>
        <p className="whitespace-pre-wrap text-sm text-[#3B241B]">{note.note}</p>
        {note.editable && editNote ? (
          <button
            type="button"
            onClick={() => setDraft(note.note)}
            className="mt-2 text-sm font-bold text-[#B75D32] hover:underline"
          >
            {t.notes.edit}
          </button>
        ) : null}
      </>
    );
  }

  const save = (event) => {
    event.preventDefault();
    if (!draft.trim()) return;
    editNote.mutate(
      { noteId: note.id, note: draft.trim() },
      {
        onSuccess: () => {
          toast.success(t.toast.noteSaved);
          setDraft(null);
        },
        onError: (err) => onWriteError(err, t.toast.noteSaveFailed),
      },
    );
  };

  return (
    <form onSubmit={save} noValidate>
      <textarea
        aria-label={t.notes.editLabel}
        rows={4}
        maxLength={10000}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className={input}
      />
      <div className="mt-2 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={editNote.isPending || !draft.trim()}
          className="rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          style={{ backgroundColor: COLORS.coral }}
        >
          {editNote.isPending ? t.notes.saving : t.notes.save}
        </button>
        <button
          type="button"
          disabled={editNote.isPending}
          onClick={() => setDraft(null)}
          className="rounded-xl border-2 border-[#FFD9B3] px-4 py-2 text-sm font-bold text-[#3B241B] disabled:opacity-60"
        >
          {t.notes.cancel}
        </button>
      </div>
    </form>
  );
}

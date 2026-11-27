import { useRef, useState } from "react";
import { PET_PAGE_BUTTON } from "@/components/publicPet/PetPageParts";
import { BRAND } from "@/lib/brand/tokens";
import { RECORD_LINK_COPY } from "@/lib/recordLink/copy";
import { postRecordLink, postRecordLinkForm } from "@/lib/recordLink/request";
import recordCopy from "@/app/provider/i18n/record";
import { SignInLink } from "./SignInLink";

// Adding to a part of the record the link's owner allows: a vaccination, a lab result or a document. Drawn only for
// the parts in `record.edit_sections`; the database decides again. Nothing here changes or removes anything.

export const LINK_FILE_BYTES = 10 * 1024 * 1024;
const CATEGORIES = ["lab", "vaccine", "visit", "invoice", "other"];

// [key, kind, required]. Labels are copy keys under RECORD_LINK_COPY[lang].add.fields.
const FIELDS = {
  vaccines: [
    ["name", "text", true],
    ["date_given", "date"],
    ["expires_on", "date"],
    ["lot", "text"],
    ["clinic_name", "text"],
    ["notes", "area"],
  ],
  lab_results: [
    ["test_name", "text", true],
    ["test_date", "date", true],
    ["results", "area"],
    ["ordered_by", "text"],
    ["notes", "area"],
  ],
  files: [
    ["file", "file", true],
    ["name", "text", true],
    ["category", "category"],
    ["documentDate", "date"],
    ["notes", "area"],
  ],
};

const control = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 12,
  border: `1px solid ${BRAND.peach}`,
  padding: 10,
  fontSize: 16,
  fontFamily: "inherit",
  background: "#fff",
};
const button = {
  ...PET_PAGE_BUTTON,
  display: "inline-block",
  border: "none",
  cursor: "pointer",
  fontSize: 15,
  fontFamily: "inherit",
  marginTop: 8,
};
const plain = { ...button, background: "transparent", color: BRAND.brown, textDecoration: "underline" };

export default function AddEntryForm({ section, lang, token, signedIn, onReload, onClosed }) {
  const t = RECORD_LINK_COPY[lang].add;
  const errors = RECORD_LINK_COPY[lang].errors;
  const categories = recordCopy[lang].files.categories;
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({});
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null); // a key of `messages`
  const inFlight = useRef(false);

  const messages = {
    added: t.added,
    required: t.required,
    add_not_allowed: t.notAllowed,
    record_limit: t.limit,
    bad_data: t.invalid,
    file_type: t.fileType,
    file_too_large: t.tooLarge,
    too_large: t.tooLarge,
    add_unavailable: t.unavailable,
    session: RECORD_LINK_COPY[lang].notes.sessionEnded,
    tooMany: errors.tooMany,
    failed: t.failed,
  };

  const submit = async (event) => {
    event.preventDefault();
    if (inFlight.current) return;
    const filled = Object.fromEntries(
      Object.entries(values)
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => value),
    );
    const missing = FIELDS[section].some(
      ([key, kind, required]) => required && (kind === "file" ? !file : !filled[key]),
    );
    if (missing) return setStatus("required");
    if (file && file.size > LINK_FILE_BYTES) return setStatus("file_too_large");

    inFlight.current = true;
    setSending(true);
    setStatus(null);
    let result;
    if (section === "files") {
      const form = new FormData();
      form.append("token", token);
      for (const [key, value] of Object.entries({ category: "lab", ...filled })) form.append(key, value);
      form.append("file", file);
      result = await postRecordLinkForm("documents", form);
    } else {
      result = await postRecordLink("records", { token, section, data: filled }, { withSession: true });
    }
    inFlight.current = false;
    setSending(false);

    const code = result.data?.code;
    if (result.status === 201) {
      setValues({});
      setFile(null);
      setOpen(false);
      setStatus("added");
      onReload();
    } else if (code === "link_not_valid") {
      onClosed();
    } else if (messages[code]) {
      setStatus(code);
      if (code === "add_not_allowed") onReload();
    } else if (result.status === 401) {
      setStatus("session");
    } else if (result.status === 429) {
      setStatus("tooMany");
    } else {
      setStatus("failed");
    }
  };

  const set = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const input = ([key, kind, required]) => {
    const id = `add-${section}-${key}`;
    const label = `${t.fields[section][key]}${required ? " *" : ""}`;
    let field;
    if (kind === "area") {
      field = <textarea id={id} rows={3} maxLength={2000} value={values[key] ?? ""} onChange={set(key)} style={control} />;
    } else if (kind === "category") {
      field = (
        <select id={id} value={values[key] ?? "lab"} onChange={set(key)} style={control}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categories[c]}
            </option>
          ))}
        </select>
      );
    } else if (kind === "file") {
      field = (
        <>
          <input
            id={id}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            style={{ ...control, padding: 8 }}
          />
          <span style={{ color: BRAND.muted, fontSize: 13 }}>{t.fileHint}</span>
        </>
      );
    } else {
      field = <input id={id} type={kind} maxLength={200} value={values[key] ?? ""} onChange={set(key)} style={control} />;
    }
    return (
      <div key={key} style={{ marginTop: 10 }}>
        <label htmlFor={id} style={{ display: "block", fontWeight: 700, marginBottom: 4, fontSize: 14 }}>
          {label}
        </label>
        {field}
      </div>
    );
  };

  return (
    <div style={{ borderTop: `1px solid ${BRAND.border}`, paddingTop: 10, marginTop: 4 }}>
      {open ? (
        <form onSubmit={submit} noValidate aria-label={t.open[section]}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }} data-testid={`add-author-${section}`}>
            {signedIn ? t.signedIn : t.signedOut}{" "}
            {!signedIn || status === "session" ? (
              <SignInLink token={token}>{RECORD_LINK_COPY[lang].notes.signInShort}</SignInLink>
            ) : null}
          </p>
          {FIELDS[section].map(input)}
          <button type="submit" disabled={sending} style={{ ...button, opacity: sending ? 0.6 : 1 }}>
            {sending ? t.adding : t.save}
          </button>{" "}
          <button
            type="button"
            disabled={sending}
            style={plain}
            onClick={() => {
              setOpen(false);
              setStatus(null);
            }}
          >
            {RECORD_LINK_COPY[lang].notes.cancel}
          </button>
        </form>
      ) : (
        <button
          type="button"
          style={button}
          onClick={() => {
            setStatus(null);
            setOpen(true);
          }}
        >
          {t.open[section]}
        </button>
      )}
      {status ? (
        <p role="status" style={{ margin: "8px 0 0", fontWeight: 700 }}>
          {messages[status]}
        </p>
      ) : null}
    </div>
  );
}

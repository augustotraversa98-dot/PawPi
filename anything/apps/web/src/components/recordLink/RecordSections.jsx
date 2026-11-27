import { useRef, useState } from "react";
import { PET_PAGE_BUTTON } from "@/components/publicPet/PetPageParts";
import { BRAND } from "@/lib/brand/tokens";
import { RECORD_LINK_COPY } from "@/lib/recordLink/copy";
import { postRecordLink } from "@/lib/recordLink/request";
import recordCopy from "@/app/provider/i18n/record";
import { fill } from "@/app/provider/i18n/lib/format";
import { formatRecordDate } from "@/app/provider/lib/record";

// The parts of a record a link shares, and the one thing a link may allow: adding a vet note. Only the sections in
// `record.sections` are drawn.

// The record screen's section keys, in the order they are shown.
const ORDER = [
  "profile",
  "emergency_contact",
  "insurance",
  "vet_notes",
  "vaccines",
  "files",
  "photos",
  "lab_results",
];

const FIELDS = {
  profile: [
    "microchip_id",
    "spayed_neutered_status",
    "spayed_neutered_date",
    "primary_vet_name",
    "primary_clinic_name",
    "vet_phone",
    "vet_email",
    "medical_notes",
  ],
  emergency_contact: ["emergency_contact_name", "emergency_contact_phone"],
  insurance: ["insurance_provider", "insurance_policy_number"],
};
const FIELD_COPY = {
  profile: "profile",
  emergency_contact: "emergencyContact",
  insurance: "insurance",
};

const NOTE_MAX = 2000;

const card = {
  background: BRAND.card,
  border: `1px solid ${BRAND.border}`,
  borderRadius: 16,
  padding: 20,
  color: BRAND.brown,
  marginBottom: 12,
  overflowWrap: "anywhere",
};
const item = { borderTop: `1px solid ${BRAND.border}`, padding: "10px 0" };
const muted = { color: BRAND.muted, fontSize: 13 };
const text = { margin: "4px 0 0", whiteSpace: "pre-wrap", lineHeight: 1.5 };
const button = {
  ...PET_PAGE_BUTTON,
  display: "inline-block",
  border: "none",
  cursor: "pointer",
  fontSize: 15,
  fontFamily: "inherit",
  marginTop: 8,
};
const link = { color: BRAND.brown, textDecoration: "underline", fontWeight: 700 };

const join = (parts) => parts.filter(Boolean).join(" · ");

function Section({ title, children }) {
  return (
    <section style={card} aria-label={title}>
      <h3 style={{ fontSize: 17, margin: "0 0 8px" }}>{title}</h3>
      {children}
    </section>
  );
}

function Empty({ children }) {
  return <p style={{ ...muted, margin: 0 }}>{children}</p>;
}

function Fields({ section, values, lang }) {
  const copy = recordCopy[lang];
  const labels = copy[FIELD_COPY[section]];
  const rows = FIELDS[section].filter((key) => values?.[key]);
  if (rows.length === 0) return <Empty>{labels.empty}</Empty>;
  const shown = (key) => {
    if (key === "spayed_neutered_status") return copy.spayValues[values[key]] ?? values[key];
    if (key === "spayed_neutered_date") return formatRecordDate(values[key], lang);
    return values[key];
  };
  return (
    <dl style={{ margin: 0 }}>
      {rows.map((key) => (
        <div key={key} style={item}>
          <dt style={muted}>{labels[key]}</dt>
          <dd style={{ ...text, fontWeight: 700 }}>{shown(key)}</dd>
        </div>
      ))}
    </dl>
  );
}

// Who a note is from, as the page names them.
function noteAuthor(note, lang) {
  const t = RECORD_LINK_COPY[lang];
  const notes = recordCopy[lang].notes;
  if (!note.via_link) return note.vet_name || t.owner;
  if (note.external_author_name === "Former member") return notes.formerMember;
  return note.external_author_name || notes.anonymous;
}

function NoteForm({ lang, token, signedIn, onReload, onClosed }) {
  const t = RECORD_LINK_COPY[lang].notes;
  const errors = RECORD_LINK_COPY[lang].errors;
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null); // a key of `messages`
  const inFlight = useRef(false);

  const messages = {
    added: t.added,
    required: t.required,
    note_limit: t.limit,
    notes_not_allowed: t.notAllowed,
    session: t.sessionEnded,
    tooMany: errors.tooMany,
    failed: t.failed,
  };

  const submit = async (event) => {
    event.preventDefault();
    if (inFlight.current) return;
    if (!note.trim()) {
      setStatus("required");
      return;
    }
    inFlight.current = true;
    setSending(true);
    setStatus(null);
    const result = await postRecordLink(
      "notes",
      { token, note: note.trim() },
      { withSession: true },
    );
    inFlight.current = false;
    setSending(false);
    const code = result.data?.code;
    if (result.status === 201) {
      setNote("");
      setStatus("added");
      onReload();
    } else if (code === "link_not_valid") {
      onClosed();
    } else if (code === "note_limit" || code === "notes_not_allowed") {
      setStatus(code);
    } else if (result.status === 401) {
      setStatus("session");
    } else if (result.status === 429) {
      setStatus("tooMany");
    } else {
      setStatus("failed");
    }
  };

  return (
    <section style={card} aria-label={t.addTitle}>
      <h3 style={{ fontSize: 17, margin: "0 0 4px" }}>{t.addTitle}</h3>
      <p style={{ ...muted, margin: 0, lineHeight: 1.5 }}>{t.canOnlyAdd}</p>
      <p style={{ margin: "8px 0", fontSize: 14, lineHeight: 1.5 }} data-testid="note-author">
        {signedIn ? t.signedIn : t.signedOut}{" "}
        {!signedIn || status === "session" ? (
          <a href="/account/signin?callbackUrl=%2Fshared-record" style={link}>
            {t.signIn}
          </a>
        ) : null}
      </p>
      <form onSubmit={submit} noValidate>
        <label htmlFor="link-note" style={{ display: "block", fontWeight: 700, marginBottom: 4 }}>
          {t.label}
        </label>
        <textarea
          id="link-note"
          rows={4}
          maxLength={NOTE_MAX}
          placeholder={t.placeholder}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            borderRadius: 12,
            border: `1px solid ${BRAND.peach}`,
            padding: 10,
            fontSize: 16,
            fontFamily: "inherit",
          }}
        />
        <button type="submit" disabled={sending} style={{ ...button, opacity: sending ? 0.6 : 1 }}>
          {sending ? t.adding : t.add}
        </button>
      </form>
      {status ? (
        <p role="status" style={{ margin: "8px 0 0", fontWeight: 700 }}>
          {messages[status]}
        </p>
      ) : null}
    </section>
  );
}

// A file or photo of a shared section. Its address is asked for on demand and lasts about a minute.
function FileButton({ lang, token, kind, entry, label, onReload, onClosed }) {
  const t = RECORD_LINK_COPY[lang].files;
  const [state, setState] = useState({ phase: "idle" });
  const inFlight = useRef(false);

  if (!entry.file_available) return <p style={{ ...muted, margin: "6px 0 0" }}>{t.unavailable}</p>;

  const get = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState({ phase: "getting" });
    const result = await postRecordLink("file", { token, kind, id: entry.id });
    inFlight.current = false;
    if (result.status === 200 && result.data?.url) {
      setState({ phase: "ready", url: result.data.url });
    } else if (result.data?.code === "link_not_valid") {
      // Either the link stopped working or this item is no longer shared: reading the record again tells which.
      setState({ phase: "idle" });
      onReload();
    } else if (result.data?.code === "file_not_available") {
      setState({ phase: "unavailable" });
    } else {
      setState({ phase: result.status === 429 ? "tooMany" : "failed" });
    }
  };

  if (state.phase === "unavailable") return <p style={{ ...muted, margin: "6px 0 0" }}>{t.unavailable}</p>;
  if (state.phase === "ready") {
    return kind === "photo" ? (
      <img
        src={state.url}
        alt={label}
        referrerPolicy="no-referrer"
        style={{ display: "block", maxWidth: "100%", borderRadius: 12, marginTop: 8 }}
      />
    ) : (
      <p style={{ margin: "8px 0 0" }}>
        <a href={state.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" style={link}>
          {t.open}
        </a>{" "}
        <button type="button" onClick={get} style={{ ...button, marginTop: 0 }}>
          {t.get}
        </button>
      </p>
    );
  }
  const idleLabel = kind === "photo" ? t.showPhoto : t.get;
  return (
    <>
      <button type="button" onClick={get} disabled={state.phase === "getting"} style={button}>
        {state.phase === "getting" ? t.getting : idleLabel}
      </button>
      {state.phase === "failed" || state.phase === "tooMany" ? (
        <p role="status" style={{ margin: "6px 0 0", fontWeight: 700 }}>
          {state.phase === "tooMany" ? RECORD_LINK_COPY[lang].errors.tooMany : t.failed}
        </p>
      ) : null}
    </>
  );
}

export default function RecordSections({ lang, record, token, signedIn, onReload, onClosed }) {
  const copy = recordCopy[lang];
  const t = RECORD_LINK_COPY[lang];
  const shared = ORDER.filter((key) => record.sections?.includes(key));
  const files = { lang, token, onReload, onClosed };

  const body = (key) => {
    if (FIELDS[key]) return <Fields section={key} values={record[key]} lang={lang} />;
    const list = record[key] ?? [];
    if (key === "vet_notes") {
      if (list.length === 0) return <Empty>{copy.notes.empty}</Empty>;
      return list.map((n, index) => (
        <div key={index} style={item}>
          <div style={muted}>
            {join([formatRecordDate(n.note_date, lang), noteAuthor(n, lang), n.via_link && copy.notes.viaLink])}
          </div>
          <p style={text}>{n.note}</p>
        </div>
      ));
    }
    if (key === "vaccines") {
      if (list.length === 0) return <Empty>{copy.vaccinations.empty}</Empty>;
      return list.map((v, index) => (
        <div key={index} style={item}>
          <strong>{v.name}</strong>
          <div style={muted}>
            {join([
              v.date_given && `${copy.vaccinations.given}: ${formatRecordDate(v.date_given, lang)}`,
              v.expires_on && `${copy.vaccinations.expires}: ${formatRecordDate(v.expires_on, lang)}`,
              v.lot && `${copy.vaccinations.lot}: ${v.lot}`,
              v.clinic_name && `${t.clinic}: ${v.clinic_name}`,
            ])}
          </div>
          {v.notes ? <p style={text}>{v.notes}</p> : null}
        </div>
      ));
    }
    if (key === "files") {
      if (list.length === 0) return <Empty>{copy.files.empty}</Empty>;
      return list.map((d) => (
        <div key={d.id} style={item}>
          <strong>{d.name}</strong>
          <div style={muted}>
            {join([d.document_type, d.document_date && formatRecordDate(d.document_date, lang)])}
          </div>
          {d.notes ? <p style={text}>{d.notes}</p> : null}
          <FileButton {...files} kind="document" entry={d} label={d.name} />
        </div>
      ));
    }
    if (key === "photos") {
      if (list.length === 0) return <Empty>{copy.photos.empty}</Empty>;
      return list.map((p) => {
        const area = copy.photos.areas[p.body_area] ?? p.body_area;
        return (
          <div key={p.id} style={item}>
            <strong>{area}</strong>
            <div style={muted}>{formatRecordDate(p.created_at, lang)}</div>
            {p.notes ? <p style={text}>{p.notes}</p> : null}
            <FileButton {...files} kind="photo" entry={p} label={area} />
          </div>
        );
      });
    }
    if (list.length === 0) return <Empty>{copy.labResults.empty}</Empty>;
    return list.map((r, index) => (
      <div key={index} style={item}>
        <strong>{r.test_name}</strong>
        <div style={muted}>
          {join([
            formatRecordDate(r.test_date, lang),
            r.ordered_by && fill(copy.labResults.orderedBy, { name: r.ordered_by }),
          ])}
        </div>
        {r.results ? <p style={text}>{r.results}</p> : null}
        {r.notes ? <p style={text}>{r.notes}</p> : null}
      </div>
    ));
  };

  return (
    <>
      {shared.map((key) => (
        <Section key={key} title={copy.sections[key]}>
          {body(key)}
        </Section>
      ))}
      {record.allow_notes ? (
        <NoteForm lang={lang} token={token} signedIn={signedIn} onReload={onReload} onClosed={onClosed} />
      ) : null}
    </>
  );
}

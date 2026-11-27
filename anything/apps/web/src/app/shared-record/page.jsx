import { useCallback, useEffect, useRef, useState } from "react";
import { PetPageHeader, PET_PAGE_BUTTON, PET_PAGE_WRAP } from "@/components/publicPet/PetPageParts";
import RecordSections from "@/components/recordLink/RecordSections";
import { BRAND } from "@/lib/brand/tokens";
import { useDocumentHead } from "@/lib/legal/head";
import { useVisitorLang } from "@/lib/publicPet/useVisitorLang";
import { RECORD_LINK_COPY } from "@/lib/recordLink/copy";
import { postRecordLink } from "@/lib/recordLink/request";
import recordCopy from "@/app/provider/i18n/record";
import { fill } from "@/app/provider/i18n/lib/format";
import useUser from "@/utils/useUser";

// /shared-record#<token> — a pet owner's record link (migration 0153, docs/vet-sharing-design.md "Record links").
// Opens with no account and shows only what the owner chose.
//
// The token stays after the '#', so it is never part of a request URL or a Referer. On arrival it is moved into this
// tab's sessionStorage (so it survives a reload, or signing in and coming back) and removed from the address bar. It is
// only ever sent in the body of the three record link requests. Never put it in a URL, a log or an analytics event.
// The server sends this page with no-store, noindex and no-referrer (app/api/utils/sharedRecordHeaders.js).

export const RECORD_LINK_STORAGE_KEY = "pawpi.recordLink";

// Storage can be unavailable (private windows, blocked site data): the page then works until it is left.
const storage = {
  read() {
    try {
      return window.sessionStorage.getItem(RECORD_LINK_STORAGE_KEY);
    } catch {
      return null;
    }
  },
  write(value) {
    try {
      window.sessionStorage.setItem(RECORD_LINK_STORAGE_KEY, value);
    } catch {
      /* unavailable */
    }
  },
  clear() {
    try {
      window.sessionStorage.removeItem(RECORD_LINK_STORAGE_KEY);
    } catch {
      /* unavailable */
    }
  },
};

function takeToken() {
  const { hash, pathname, search } = window.location;
  const fromLink = hash.replace(/^#/, "");
  if (!fromLink) return storage.read();
  storage.write(fromLink);
  window.history.replaceState(window.history.state, "", `${pathname}${search}`);
  return fromLink;
}

const card = {
  background: BRAND.card,
  border: `1px solid ${BRAND.border}`,
  borderRadius: 16,
  padding: 20,
  color: BRAND.brown,
  marginBottom: 12,
};

const formatDay = (value, lang) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(lang === "es" ? "es-AR" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

function Message({ title, body, children }) {
  return (
    <section style={card}>
      <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>{title}</h2>
      <p style={{ margin: 0, lineHeight: 1.5 }}>{body}</p>
      {children}
    </section>
  );
}

export default function SharedRecordPage() {
  const { user } = useUser();
  const { lang, setLang } = useVisitorLang();
  const t = RECORD_LINK_COPY[lang];
  const record = recordCopy[lang];
  useDocumentHead([{ title: t.documentTitle }, { name: "referrer", content: "no-referrer" }]);

  const [token, setToken] = useState(undefined); // undefined = not read yet, null = none
  const [view, setView] = useState({ phase: "loading" });
  const latest = useRef(0); // only the answer to the newest request is shown

  useEffect(() => {
    const read = () => {
      const next = takeToken();
      setToken((previous) => next ?? previous ?? null);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  // The link stopped working: nothing already shown stays on the screen.
  const close = useCallback(() => {
    latest.current += 1;
    storage.clear();
    setView({ phase: "unavailable" });
  }, []);

  // `quiet` keeps what is on screen while it is read again (after a note, or after a file was refused).
  const load = useCallback(
    async (current, { quiet = false } = {}) => {
      const request = (latest.current += 1);
      if (!quiet) setView({ phase: "loading" });
      const result = await postRecordLink("open", { token: current });
      if (request !== latest.current) return;
      if (result.status === 200 && result.data?.record) {
        setView({ phase: "ok", record: result.data.record });
      } else if (result.status === 403) {
        close();
      } else if (!quiet) {
        setView({ phase: result.status === 429 ? "tooMany" : "error" });
      }
    },
    [close],
  );

  useEffect(() => {
    if (token) load(token);
  }, [token, load]);

  const phase = token === undefined ? "loading" : token ? view.phase : "noLink";

  let content;
  if (phase === "loading") {
    content = <p style={{ textAlign: "center", color: BRAND.brown }}>{t.loading}</p>;
  } else if (phase === "noLink") {
    content = <Message {...t.noLink} />;
  } else if (phase === "unavailable") {
    content = <Message {...t.unavailable} />;
  } else if (phase === "ok") {
    const shared = view.record;
    content = (
      <>
        <section style={card}>
          <h2 style={{ fontSize: 22, margin: "0 0 4px", overflowWrap: "anywhere" }}>
            {fill(t.header.heading, { pet: shared.pet_name })}
          </h2>
          <p style={{ margin: 0 }}>
            {fill(t.header.sharedBy, { owner: shared.owner_name || t.header.someone })}
          </p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>
            {fill(t.header.until, { date: formatDay(shared.expires_at, lang) })}
          </p>
          <p style={{ margin: "12px 0 0", color: BRAND.muted, fontSize: 14, lineHeight: 1.5 }}>
            {t.header.warning}
          </p>
          <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.5 }} data-testid="link-sections">
            <strong>{t.header.shared}: </strong>
            {(shared.sections ?? []).map((key) => record.sections[key] ?? key).join(", ")}.{" "}
            {t.header.onlyThis}
          </p>
        </section>
        <RecordSections
          lang={lang}
          record={shared}
          token={token}
          signedIn={!!user}
          onReload={() => load(token, { quiet: true })}
          onClosed={close}
        />
        <p style={{ color: BRAND.muted, fontSize: 13, textAlign: "center" }}>{t.disclaimer}</p>
      </>
    );
  } else {
    content = (
      <Message title={t.title} body={phase === "tooMany" ? t.errors.tooMany : t.errors.generic}>
        <button
          type="button"
          onClick={() => load(token)}
          style={{
            ...PET_PAGE_BUTTON,
            width: "100%",
            boxSizing: "border-box",
            border: "none",
            cursor: "pointer",
            fontSize: 16,
            fontFamily: "inherit",
            marginTop: 14,
          }}
        >
          {t.errors.retry}
        </button>
      </Message>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: BRAND.cream }}>
      <main style={{ ...PET_PAGE_WRAP, maxWidth: 640 }}>
        <PetPageHeader lang={lang} setLang={setLang} copy={t} heading={t.title} />
        {content}
      </main>
    </div>
  );
}

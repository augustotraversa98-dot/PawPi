import { useCallback, useEffect, useRef, useState } from "react";
import { PetPageHeader, PET_PAGE_BUTTON, PET_PAGE_WRAP } from "@/components/publicPet/PetPageParts";
import RecordSections from "@/components/recordLink/RecordSections";
import { RETURN_PARAM, takeReturnToken } from "@/components/recordLink/signInReturn";
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
// WHICH record is shown comes from this page's own address and nothing else, so several links open at once (tabs,
// bookmarks, a reload) never show each other's pet. The token stays after the '#', so it is never part of a request URL
// or a Referer; it is only ever sent in the body of the record link requests. Never put it in a path, a query string, a
// log or an analytics event. The server sends this page with no-store, noindex and no-referrer
// (app/api/utils/sharedRecordHeaders.js).
//
// Signing in leaves this page, and a sign-in address cannot carry the token. So the "sign in" link keeps it in this tab
// under a one-off id (components/recordLink/signInReturn.js) and comes back to /shared-record?return=<id>.

// The token in this page's address. Coming back from signing in, it is first put back there.
function readToken() {
  const url = new URL(window.location.href);
  const fromAddress = url.hash.replace(/^#/, "");
  if (fromAddress) return fromAddress;
  const id = url.searchParams.get(RETURN_PARAM);
  if (!id) return null;
  const kept = takeReturnToken(id);
  url.searchParams.delete(RETURN_PARAM);
  url.hash = kept ?? "";
  window.history.replaceState(window.history.state, "", url);
  return kept;
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
  const signedIn = !!user;
  const { lang, setLang } = useVisitorLang();
  const t = RECORD_LINK_COPY[lang];
  const record = recordCopy[lang];

  const [token, setToken] = useState(undefined); // undefined = not read yet, null = none
  const [view, setView] = useState({ phase: "loading", token: null });
  const latest = useRef(0); // only the answer to the newest request is shown
  const shownToken = useRef(null); // the link whose record is on the screen

  useEffect(() => {
    const read = () => setToken(readToken());
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  // The link stopped working: nothing already shown stays on the screen.
  const close = useCallback((current) => {
    latest.current += 1;
    shownToken.current = null;
    setView({ phase: "unavailable", token: current });
  }, []);

  // `quiet` keeps what is on screen while it is read again (after a note, or after a file was refused).
  const load = useCallback(
    async (current, { quiet = false } = {}) => {
      const request = (latest.current += 1);
      if (!quiet) setView({ phase: "loading", token: current });
      // Signed in, the session is sent so the answer says which notes are the visitor's own. A session that stopped
      // working never keeps the record from opening.
      let result = await postRecordLink("open", { token: current }, { withSession: signedIn });
      if (signedIn && result.status === 401) result = await postRecordLink("open", { token: current });
      if (request !== latest.current) return;
      if (result.status === 200 && result.data?.record) {
        shownToken.current = current;
        setView({ phase: "ok", token: current, record: result.data.record });
      } else if (result.status === 403) {
        close(current);
      } else if (!quiet) {
        setView({ phase: result.status === 429 ? "tooMany" : "error", token: current });
      }
    },
    [close, signedIn],
  );

  useEffect(() => {
    if (token) load(token, { quiet: shownToken.current === token });
  }, [token, load]);

  // Nothing read for one link is ever drawn under another's address.
  let phase = "noLink";
  if (token === undefined) phase = "loading";
  else if (token) phase = view.token === token ? view.phase : "loading";

  // The pet's name tells the tabs apart when several links are open.
  const petName = phase === "ok" ? view.record.pet_name : null;
  useDocumentHead([
    { title: petName ? `${petName} · ${t.documentTitle}` : t.documentTitle },
    { name: "referrer", content: "no-referrer" },
  ]);

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
          key={token}
          lang={lang}
          record={shared}
          token={token}
          signedIn={signedIn}
          onReload={() => load(token, { quiet: true })}
          onClosed={() => close(token)}
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

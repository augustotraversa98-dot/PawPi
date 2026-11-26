import { useCallback, useEffect, useState } from "react";
import { PetPageHeader, PET_PAGE_BUTTON, PET_PAGE_WRAP } from "@/components/publicPet/PetPageParts";
import { BRAND } from "@/lib/brand/tokens";
import { useDocumentHead } from "@/lib/legal/head";
import { useVisitorLang } from "@/lib/publicPet/useVisitorLang";
import { VET_INVITE_COPY } from "@/lib/vetInvite/copy";
import useUser from "@/utils/useUser";

// /vet-invite#<token> — a pet owner's invite link for a vet (migration 0148, docs/vet-sharing-design.md).
//
// The token stays after the '#', so it is never part of a request URL or a Referer. On arrival it is moved into this
// tab's sessionStorage (so it survives the trip to sign-in and back) and removed from the address bar. It is only ever
// sent in the body of the two invite requests. Never put it in a URL, a log or an analytics event.
//
// Accepting shows no record data: it files a request that the owner approves or denies.

export const INVITE_STORAGE_KEY = "pawpi.vetInvite";
const SIGN_IN_HREF = "/account/signin?callbackUrl=%2Fvet-invite";

// Storage can be unavailable (private windows, blocked site data): the page then works until it is left.
const storage = {
  read() {
    try {
      return window.sessionStorage.getItem(INVITE_STORAGE_KEY);
    } catch {
      return null;
    }
  },
  write(value) {
    try {
      window.sessionStorage.setItem(INVITE_STORAGE_KEY, value);
    } catch {
      /* unavailable */
    }
  },
  clear() {
    try {
      window.sessionStorage.removeItem(INVITE_STORAGE_KEY);
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

const fill = (template, values) =>
  template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));

const formatDay = (value, lang) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(lang === "es" ? "es-AR" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

async function postInvite(path, body) {
  const response = await fetch(`/api/care-access/invites/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

// Which screen an unsuccessful answer leads to.
function failurePhase({ status, data }) {
  if (status === 401) return "signedOut";
  if (status === 403 && data?.code === "no_business") return "noBusiness";
  if (status === 404 && data?.code === "invite_not_valid") return "invalid";
  if (status === 429) return "tooMany";
  return "error";
}

const card = {
  background: BRAND.card,
  border: `1px solid ${BRAND.border}`,
  borderRadius: 16,
  padding: 20,
  color: BRAND.brown,
};
const primary = {
  ...PET_PAGE_BUTTON,
  width: "100%",
  boxSizing: "border-box",
  border: "none",
  cursor: "pointer",
  fontSize: 16,
  fontFamily: "inherit",
  marginTop: 14,
};
const secondary = { display: "block", textAlign: "center", color: BRAND.brown, marginTop: 14 };

function Message({ title, body, children }) {
  return (
    <section style={card}>
      <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>{title}</h2>
      <p style={{ margin: 0, lineHeight: 1.5 }}>{body}</p>
      {children}
    </section>
  );
}

export default function VetInvitePage() {
  const { user, loading: authLoading } = useUser();
  const { lang, setLang } = useVisitorLang();
  const t = VET_INVITE_COPY[lang];
  useDocumentHead([{ title: t.documentTitle }, { name: "referrer", content: "no-referrer" }]);

  const [token, setToken] = useState(undefined); // undefined = not read yet, null = none
  const [view, setView] = useState({ phase: "loading" });
  const [providerId, setProviderId] = useState("");
  const [sending, setSending] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const read = () => {
      const next = takeToken();
      setToken((previous) => next ?? previous ?? null);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!token || authLoading || !userId) return undefined;
    let alive = true;
    setView({ phase: "loading" });
    setProviderId("");
    postInvite("preview", { token })
      .then((answer) => {
        if (!alive) return;
        if (answer.status !== 200 || !answer.data?.invite) {
          const phase = failurePhase(answer);
          if (phase === "invalid") storage.clear();
          setView({ phase });
          return;
        }
        const { invite, businesses } = answer.data;
        if (businesses.length === 1) setProviderId(String(businesses[0].id));
        setView({ phase: "ready", invite, businesses });
      })
      .catch(() => alive && setView({ phase: "error" }));
    return () => {
      alive = false;
    };
  }, [token, userId, authLoading, attempt]);

  const accept = useCallback(async () => {
    if (!providerId || sending) return;
    setSending(true);
    try {
      const answer = await postInvite("accept", { token, providerId: Number(providerId) });
      const done = answer.data?.status;
      if (answer.status === 200 && (done === "requested" || done === "already_open")) {
        if (done === "requested") storage.clear();
        setView({
          phase: done === "requested" ? "requested" : "alreadyOpen",
          petName: answer.data.petName,
        });
        return;
      }
      const phase = failurePhase(answer);
      if (phase === "invalid") storage.clear();
      setView({ phase });
    } catch {
      setView({ phase: "error" });
    } finally {
      setSending(false);
    }
  }, [providerId, sending, token]);

  let phase = view.phase;
  if (token === undefined || authLoading) phase = "loading";
  else if (!token) phase = "noLink";
  else if (!user) phase = "signedOut";

  const clinicalLink = (
    <a href="/provider/clinical" style={primary}>
      {t.openClinical}
    </a>
  );

  let content;
  if (phase === "loading") {
    content = <p style={{ textAlign: "center", color: BRAND.brown }}>{t.loading}</p>;
  } else if (phase === "noLink") {
    content = <Message {...t.noLink} />;
  } else if (phase === "signedOut") {
    content = (
      <Message title={t.signedOut.title} body={t.signedOut.body}>
        <a href={SIGN_IN_HREF} style={primary}>
          {t.signedOut.signIn}
        </a>
        <a href="/account/signup" style={secondary}>
          {t.signedOut.signUp}
        </a>
      </Message>
    );
  } else if (phase === "noBusiness") {
    content = (
      <Message title={t.noBusiness.title} body={t.noBusiness.body}>
        <a href="/provider" style={primary}>
          {t.noBusiness.provider}
        </a>
        <a href="/account/logout" style={secondary}>
          {t.noBusiness.signOut}
        </a>
      </Message>
    );
  } else if (phase === "invalid") {
    content = <Message {...t.invalid} />;
  } else if (phase === "requested" || phase === "alreadyOpen") {
    const copy = t[phase];
    content = (
      <Message title={copy.title} body={fill(copy.body, { pet: view.petName })}>
        {clinicalLink}
      </Message>
    );
  } else if (phase === "ready") {
    const { invite, businesses } = view;
    const owner = invite.ownerName || t.invite.someone;
    content = (
      <Message
        title={fill(t.invite.heading, { owner, pet: invite.petName })}
        body={t.invite.explain}
      >
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px" }}>
          <dt style={{ color: BRAND.muted }}>{t.invite.pet}</dt>
          <dd style={{ margin: 0, fontWeight: 700 }}>{invite.petName}</dd>
          <dt style={{ color: BRAND.muted }}>{t.invite.owner}</dt>
          <dd style={{ margin: 0, fontWeight: 700 }}>{owner}</dd>
        </dl>
        <p style={{ color: BRAND.muted, fontSize: 14 }}>
          {fill(t.invite.expires, { date: formatDay(invite.expiresAt, lang) })}
        </p>
        <label style={{ display: "block", fontWeight: 700 }}>
          {t.invite.business}
          <select
            value={providerId}
            onChange={(event) => setProviderId(event.target.value)}
            style={{
              display: "block",
              width: "100%",
              marginTop: 6,
              padding: 10,
              borderRadius: 12,
              border: `1px solid ${BRAND.peach}`,
              fontSize: 16,
              fontFamily: "inherit",
            }}
          >
            {businesses.length > 1 ? <option value="">{t.invite.choose}</option> : null}
            {businesses.map((business) => (
              <option key={business.id} value={String(business.id)}>
                {business.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={accept}
          disabled={!providerId || sending}
          style={{ ...primary, opacity: !providerId || sending ? 0.6 : 1 }}
        >
          {sending ? t.invite.accepting : t.invite.accept}
        </button>
      </Message>
    );
  } else {
    content = (
      <Message
        title={t.title}
        body={phase === "tooMany" ? t.errors.tooMany : t.errors.generic}
      >
        <button type="button" onClick={() => setAttempt((n) => n + 1)} style={primary}>
          {t.errors.retry}
        </button>
      </Message>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: BRAND.cream }}>
      <main style={PET_PAGE_WRAP}>
        <PetPageHeader lang={lang} setLang={setLang} copy={t} heading={t.title} />
        {content}
      </main>
    </div>
  );
}

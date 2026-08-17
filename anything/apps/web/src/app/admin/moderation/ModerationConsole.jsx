import { useCallback, useEffect, useMemo, useState } from "react";

// MOD2 PR1 — the moderation console (Apple Guideline 1.2 "act within 24h"), now a scannable
// triage view. It reads the ENRICHED admin queue from GET /api/admin/reports (backed by
// app_admin_list_reports_v2 / 0116) and acts through POST /api/admin/reports/[id]/action. BOTH
// endpoints are gated server-side by app_is_admin() (0065/0114/0116) — a non-admin gets 403 and
// this screen renders a bare "not authorized" state with NO report data, so the gate is the API's
// (no leak is possible: the only source of report rows is the admin-only endpoint).
//
// Each row is a triage card: the reported content preview (text snippet + thumbnail), the reported
// author, the reporter(s) + a distinct-reporter count (pile-on signal), the reason + the reporter's
// note, and BOTH an exact timestamp and a relative age — enough to decide in seconds. Remove /
// Dismiss / Ban are unchanged. The web extranet has no shared i18n framework, so labels ship as a
// self-contained EN/ES map picked from navigator.language, with a manual toggle.

const STATUS_TAB_KEYS = ["open", "actioned", "dismissed", "all"];

// Self-contained EN/ES label map (the extranet has no i18n runtime; this internal tool carries its
// own). Content previews are user text and are shown as-authored — only the chrome is translated.
const STRINGS = {
  en: {
    title: "Moderation queue",
    subtitle:
      "Review reported content and act on it. Removing content hides it from everyone; Ban also blocks the offending account.",
    tabs: { open: "Open", actioned: "Actioned", dismissed: "Dismissed", all: "All" },
    statusLabel: { open: "open", actioned: "actioned", dismissed: "dismissed" },
    loading: "Loading…",
    signInPrompt: "Please sign in to continue.",
    goToSignIn: "Go to sign in",
    noAccess: "You don't have access to the moderation console.",
    loadError: "Couldn't load the moderation queue.",
    retry: "Retry",
    emptyQueue: (status) => `Nothing here — the ${status} queue is empty.`,
    reason: "Reason",
    details: "Details",
    reportedAuthor: "Reported author",
    reportedBy: "Reported by",
    reportsOnTarget: (n) => `${n} reporters on this target`,
    filed: "Report filed",
    contentPosted: "Content posted",
    remove: "Remove content",
    working: "Working…",
    dismiss: "Dismiss",
    banLabel: "Ban the author when removing",
    actionFailedNetwork: "Action failed — network error.",
    actionFailedStatus: (s) => `Action failed (${s})`,
    unknownUser: "unknown",
    noPreview: "(no text preview)",
    langToggle: "ES",
  },
  es: {
    title: "Cola de moderación",
    subtitle:
      "Revisá el contenido reportado y actuá. Quitar el contenido lo oculta para todos; Banear además bloquea la cuenta infractora.",
    tabs: { open: "Abiertos", actioned: "Accionados", dismissed: "Descartados", all: "Todos" },
    statusLabel: { open: "abierto", actioned: "accionado", dismissed: "descartado" },
    loading: "Cargando…",
    signInPrompt: "Iniciá sesión para continuar.",
    goToSignIn: "Ir a iniciar sesión",
    noAccess: "No tenés acceso a la consola de moderación.",
    loadError: "No se pudo cargar la cola de moderación.",
    retry: "Reintentar",
    emptyQueue: (status) => `Nada por acá — la cola de ${status} está vacía.`,
    reason: "Motivo",
    details: "Detalle",
    reportedAuthor: "Autor reportado",
    reportedBy: "Reportado por",
    reportsOnTarget: (n) => `${n} personas reportaron esto`,
    filed: "Reporte creado",
    contentPosted: "Contenido publicado",
    remove: "Quitar contenido",
    working: "Procesando…",
    dismiss: "Descartar",
    banLabel: "Banear al autor al quitar",
    actionFailedNetwork: "Falló la acción — error de red.",
    actionFailedStatus: (s) => `Falló la acción (${s})`,
    unknownUser: "desconocido",
    noPreview: "(sin vista previa de texto)",
    langToggle: "EN",
  },
};

function detectLang() {
  if (typeof navigator === "undefined") return "en";
  const l = (navigator.language || "en").toLowerCase();
  return l.startsWith("es") ? "es" : "en";
}

const DATE_LOCALE = { en: "en-GB", es: "es-ES" };

// Exact, absolute timestamp — e.g. "16 Aug 2026, 21:45" (EN) / "16 ago 2026, 21:45" (ES).
function fmtAbsolute(iso, lang) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(DATE_LOCALE[lang] || "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

// Compact relative age. Localized suffix/prefix. No dependency — this is an internal tool.
function ageLabel(iso, lang) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  const mins = Math.round(secs / 60);
  const hrs = Math.round(mins / 60);
  const days = Math.round(hrs / 24);
  let unit;
  if (secs < 60) unit = `${secs}s`;
  else if (mins < 60) unit = `${mins}m`;
  else if (hrs < 24) unit = `${hrs}h`;
  else unit = `${days}d`;
  return lang === "es" ? `hace ${unit}` : `${unit} ago`;
}

const STATUS_STYLES = {
  open: "bg-amber-100 text-amber-800",
  actioned: "bg-green-100 text-green-800",
  dismissed: "bg-gray-200 text-gray-700",
};

export default function ModerationConsole() {
  const [lang, setLang] = useState(detectLang);
  const t = STRINGS[lang];

  const [status, setStatus] = useState("open");
  const [reports, setReports] = useState([]);
  // 'loading' | 'ok' | 'unauth' (401) | 'forbidden' (403) | 'error'
  const [state, setState] = useState("loading");
  const [actingId, setActingId] = useState(null);
  // Per-report "ban the author too" intent, applied only when Removing.
  const [banIntent, setBanIntent] = useState({});
  const [actionError, setActionError] = useState(null);

  const load = useCallback(async () => {
    setState("loading");
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/reports?status=${encodeURIComponent(status)}`);
      if (res.status === 401) return setState("unauth");
      if (res.status === 403) return setState("forbidden");
      if (!res.ok) return setState("error");
      const data = await res.json().catch(() => ({}));
      setReports(Array.isArray(data.reports) ? data.reports : []);
      setState("ok");
    } catch {
      setState("error");
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  // Fallback pile-on count computed from the loaded set, used only when the enriched
  // reporters_count field is absent (e.g. an un-migrated DB serving v1 rows).
  const targetCounts = useMemo(() => {
    const counts = {};
    for (const r of reports) {
      const key = `${r.target_type}:${r.target_id}`;
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [reports]);

  const act = useCallback(
    async (report, action) => {
      setActingId(report.id);
      setActionError(null);
      const ban = action === "remove" ? !!banIntent[report.id] : false;
      try {
        const res = await fetch(`/api/admin/reports/${report.id}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ban }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setActionError(data.error || t.actionFailedStatus(res.status));
          return;
        }
        await load(); // reflect the new status (a remove flips every open report on the target)
      } catch {
        setActionError(t.actionFailedNetwork);
      } finally {
        setActingId(null);
      }
    },
    [banIntent, load, t],
  );

  const openCount = state === "ok" && status === "open" ? reports.length : null;

  return (
    <div className="min-h-screen w-full bg-[#FFF7EF] p-4 sm:p-8">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#3B241B]">{t.title}</h1>
            <p className="mt-1 text-sm text-[#7A6254]">{t.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => setLang((l) => (l === "en" ? "es" : "en"))}
            aria-label="Toggle language"
            className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#7A6254] ring-1 ring-[#E7D3C2]"
          >
            {t.langToggle}
          </button>
        </header>

        {/* Status tabs */}
        <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Report status">
          {STATUS_TAB_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={status === key}
              onClick={() => setStatus(key)}
              className={
                "rounded-full px-4 py-2 text-sm font-semibold transition-colors " +
                (status === key
                  ? "bg-[#FF6F61] text-white"
                  : "bg-white text-[#7A6254] hover:bg-[#FFE8D6]")
              }
            >
              {t.tabs[key]}
              {key === "open" && openCount != null ? ` (${openCount})` : ""}
            </button>
          ))}
        </div>

        {state === "loading" && <p className="text-[#7A6254]">{t.loading}</p>}

        {state === "unauth" && (
          <div className="rounded-2xl bg-white p-8 text-center shadow">
            <p className="mb-4 text-[#3B241B]">{t.signInPrompt}</p>
            <a
              href="/account/signin"
              className="inline-block rounded-xl bg-[#FF6F61] px-4 py-3 font-bold text-white"
            >
              {t.goToSignIn}
            </a>
          </div>
        )}

        {state === "forbidden" && (
          <div className="rounded-2xl bg-white p-8 text-center shadow">
            <div className="mb-3 text-4xl">🔒</div>
            <p className="text-[#3B241B]">{t.noAccess}</p>
          </div>
        )}

        {state === "error" && (
          <div className="rounded-2xl bg-white p-6 text-center shadow">
            <p className="mb-3 text-[#3B241B]">{t.loadError}</p>
            <button
              type="button"
              onClick={load}
              className="rounded-xl bg-[#FF6F61] px-4 py-2 font-bold text-white"
            >
              {t.retry}
            </button>
          </div>
        )}

        {state === "ok" && reports.length === 0 && (
          <div className="rounded-2xl bg-white p-8 text-center shadow">
            <div className="mb-2 text-4xl">✅</div>
            <p className="text-[#7A6254]">{t.emptyQueue(t.tabs[status].toLowerCase())}</p>
          </div>
        )}

        {state === "ok" && reports.length > 0 && (
          <>
            {actionError && (
              <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                {actionError}
              </div>
            )}
            <ul className="space-y-4">
              {reports.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  t={t}
                  lang={lang}
                  fallbackCount={targetCounts[`${report.target_type}:${report.target_id}`] || 1}
                  busy={actingId === report.id}
                  banIntent={!!banIntent[report.id]}
                  onBanIntent={(checked) =>
                    setBanIntent((prev) => ({ ...prev, [report.id]: checked }))
                  }
                  onAct={act}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function ReportCard({ report, t, lang, fallbackCount, busy, banIntent, onBanIntent, onAct }) {
  const isOpen = report.status === "open";
  // Prefer the server's distinct-reporter count; fall back to the loaded-set count.
  const reporters =
    typeof report.reporters_count === "number" ? report.reporters_count : fallbackCount;
  const author = report.author_handle || t.unknownUser;
  const reporter = report.reporter_handle || t.unknownUser;
  const preview = report.preview_text;
  const image = report.preview_image_url;
  const statusText = t.statusLabel[report.status] || report.status;

  return (
    <li className="rounded-2xl bg-white p-5 shadow" data-testid="report-card">
      <div className="flex gap-4">
        {/* Thumbnail (if the target has one) */}
        {image ? (
          <img
            src={image}
            alt=""
            className="h-20 w-20 shrink-0 rounded-xl object-cover ring-1 ring-[#F3E4D6]"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : null}

        <div className="min-w-0 flex-1">
          {/* Badges: type#id · reason · status · reporter count */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-[#3B241B]">
              {report.target_type} #{report.target_id}
            </span>
            <span
              className={
                "rounded-full px-2 py-0.5 text-xs font-semibold " +
                (STATUS_STYLES[report.status] || "bg-gray-100 text-gray-700")
              }
            >
              {statusText}
            </span>
            {reporters > 1 && (
              <span className="rounded-full bg-[#FFE8D6] px-2 py-0.5 text-xs font-semibold text-[#B25A3E]">
                {t.reportsOnTarget(reporters)}
              </span>
            )}
          </div>

          {/* The reported content preview */}
          <p className="mt-2 break-words text-[15px] leading-snug text-[#3B241B]">
            {preview ? `“${preview}”` : <span className="italic text-[#A08974]">{t.noPreview}</span>}
          </p>

          {/* Who: reported author + reporter */}
          <p className="mt-2 text-sm text-[#7A6254]">
            <span className="font-semibold text-[#3B241B]">{t.reportedAuthor}:</span> @{author}
            {report.author_id ? ` (#${report.author_id})` : ""}
            <span className="mx-2 text-[#D9C3B2]">·</span>
            <span className="font-semibold text-[#3B241B]">{t.reportedBy}:</span> @{reporter}
          </p>

          {/* Why: reason + reporter's note */}
          <p className="mt-1 text-sm text-[#7A6254]">
            <span className="font-semibold text-[#3B241B]">{t.reason}:</span> {report.reason || "—"}
          </p>
          {report.details && (
            <p className="mt-1 break-words text-sm text-[#7A6254]">
              <span className="font-semibold text-[#3B241B]">{t.details}:</span> {report.details}
            </p>
          )}

          {/* When: exact timestamps + relative age */}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#A08974]">
            <span>
              {t.filed}: <span title={report.created_at}>{fmtAbsolute(report.created_at, lang)}</span>{" "}
              ({ageLabel(report.created_at, lang)})
            </span>
            {report.target_created_at && (
              <span>
                {t.contentPosted}: {fmtAbsolute(report.target_created_at, lang)}
              </span>
            )}
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#F3E4D6] pt-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => onAct(report, "remove")}
            className="rounded-xl bg-[#FF6F61] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? t.working : t.remove}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAct(report, "dismiss")}
            className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-[#7A6254] ring-1 ring-[#E7D3C2] disabled:opacity-50"
          >
            {t.dismiss}
          </button>
          <label className="ml-auto flex items-center gap-2 text-sm text-[#3B241B]">
            <input
              type="checkbox"
              checked={banIntent}
              onChange={(e) => onBanIntent(e.target.checked)}
            />
            {t.banLabel}
          </label>
        </div>
      )}
    </li>
  );
}

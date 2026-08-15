import { useCallback, useEffect, useMemo, useState } from "react";

// MOD1 PR2 — the moderation console (Apple Guideline 1.2 "act within 24h").
//
// A DELIBERATELY SIMPLE internal tool: it reads the admin queue from GET /api/admin/reports and
// acts through POST /api/admin/reports/[id]/action. BOTH endpoints are gated server-side by
// app_is_admin() (0065/0114) — a non-admin gets 403 and this screen renders a bare "not
// authorized" state with NO report data, so the gate is the API's, not this component's (no leak
// is possible: the only source of report rows is the admin-only endpoint).
//
// EN only, on purpose (internal). Reuses the app's Tailwind palette.

const STATUS_TABS = [
  { key: "open", label: "Open" },
  { key: "actioned", label: "Actioned" },
  { key: "dismissed", label: "Dismissed" },
  { key: "all", label: "All" },
];

// A short human-readable "age" for a timestamp. No dependency — this is an internal tool.
function ageLabel(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

const STATUS_STYLES = {
  open: "bg-amber-100 text-amber-800",
  actioned: "bg-green-100 text-green-800",
  dismissed: "bg-gray-200 text-gray-700",
};

export default function ModerationConsole() {
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

  // How many reports target the SAME content, within the loaded set — so the admin can see a
  // target flagged by several people at a glance ("reporter count"). Keyed by type + id.
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
          setActionError(data.error || `Action failed (${res.status})`);
          return;
        }
        await load(); // reflect the new status (a remove flips every open report on the target)
      } catch {
        setActionError("Action failed — network error.");
      } finally {
        setActingId(null);
      }
    },
    [banIntent, load],
  );

  const openCount = state === "ok" && status === "open" ? reports.length : null;

  return (
    <div className="min-h-screen w-full bg-[#FFF7EF] p-4 sm:p-8">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-[#3B241B]">Moderation queue</h1>
          <p className="mt-1 text-sm text-[#7A6254]">
            Review reported content and act on it. Removing content hides it from everyone; Ban also
            blocks the offending account.
          </p>
        </header>

        {/* Status tabs */}
        <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Report status">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={status === tab.key}
              onClick={() => setStatus(tab.key)}
              className={
                "rounded-full px-4 py-2 text-sm font-semibold transition-colors " +
                (status === tab.key
                  ? "bg-[#FF6F61] text-white"
                  : "bg-white text-[#7A6254] hover:bg-[#FFE8D6]")
              }
            >
              {tab.label}
              {tab.key === "open" && openCount != null ? ` (${openCount})` : ""}
            </button>
          ))}
        </div>

        {state === "loading" && <p className="text-[#7A6254]">Loading…</p>}

        {state === "unauth" && (
          <div className="rounded-2xl bg-white p-8 text-center shadow">
            <p className="mb-4 text-[#3B241B]">Please sign in to continue.</p>
            <a
              href="/account/signin"
              className="inline-block rounded-xl bg-[#FF6F61] px-4 py-3 font-bold text-white"
            >
              Go to sign in
            </a>
          </div>
        )}

        {state === "forbidden" && (
          <div className="rounded-2xl bg-white p-8 text-center shadow">
            <div className="mb-3 text-4xl">🔒</div>
            <p className="text-[#3B241B]">
              You don't have access to the moderation console.
            </p>
          </div>
        )}

        {state === "error" && (
          <div className="rounded-2xl bg-white p-6 text-center shadow">
            <p className="mb-3 text-[#3B241B]">Couldn't load the moderation queue.</p>
            <button
              type="button"
              onClick={load}
              className="rounded-xl bg-[#FF6F61] px-4 py-2 font-bold text-white"
            >
              Retry
            </button>
          </div>
        )}

        {state === "ok" && reports.length === 0 && (
          <div className="rounded-2xl bg-white p-8 text-center shadow">
            <div className="mb-2 text-4xl">✅</div>
            <p className="text-[#7A6254]">Nothing here — the {status} queue is empty.</p>
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
              {reports.map((report) => {
                const count = targetCounts[`${report.target_type}:${report.target_id}`] || 1;
                const isOpen = report.status === "open";
                const busy = actingId === report.id;
                return (
                  <li
                    key={report.id}
                    className="rounded-2xl bg-white p-5 shadow"
                    data-testid="report-card"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
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
                            {report.status}
                          </span>
                          {count > 1 && (
                            <span className="rounded-full bg-[#FFE8D6] px-2 py-0.5 text-xs font-semibold text-[#B25A3E]">
                              {count} reports on this target
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-sm text-[#7A6254]">
                          <span className="font-semibold text-[#3B241B]">Reason:</span>{" "}
                          {report.reason || "—"}
                        </p>
                        {report.details && (
                          <p className="mt-1 break-words text-sm text-[#7A6254]">
                            <span className="font-semibold text-[#3B241B]">Details:</span>{" "}
                            {report.details}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-[#A08974]" title={report.created_at}>
                        {ageLabel(report.created_at)}
                      </span>
                    </div>

                    {isOpen && (
                      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#F3E4D6] pt-4">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => act(report, "remove")}
                          className="rounded-xl bg-[#FF6F61] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                        >
                          {busy ? "Working…" : "Remove content"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => act(report, "dismiss")}
                          className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-[#7A6254] ring-1 ring-[#E7D3C2] disabled:opacity-50"
                        >
                          Dismiss
                        </button>
                        <label className="ml-auto flex items-center gap-2 text-sm text-[#3B241B]">
                          <input
                            type="checkbox"
                            checked={!!banIntent[report.id]}
                            onChange={(e) =>
                              setBanIntent((prev) => ({
                                ...prev,
                                [report.id]: e.target.checked,
                              }))
                            }
                          />
                          Ban the author when removing
                        </label>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

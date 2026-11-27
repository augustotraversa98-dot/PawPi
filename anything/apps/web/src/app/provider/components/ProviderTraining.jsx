import { useState } from "react";
import {
  GraduationCap,
  Loader2,
  Plus,
  Users,
  User,
  ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import {
  useTrainingSessions,
  useCreateTrainingSession,
  useTrainingProgress,
  useLogTrainingProgress,
} from "../hooks/useProviders";
import { COLORS } from "../lib/colors";
import { parseWholeNumber } from "../../../lib/decimal";
import trainingCopy from "../i18n/training";
import { useProviderCopy } from "../i18n/lib/useProviderCopy";
import { fill, plural } from "../i18n/lib/format";
import { serverErrorMessage } from "../i18n/lib/serverError";

// /provider/training — the TRAINER's Training workspace (ticket 2.10). Manage 1:1 sessions,
// GROUP CLASSES (capacity), and PROGRAMS; log per-pet PROGRESS (attendance + notes + video
// lessons). All data flows through the already-built backend; RLS (0036) + the trainer
// capability gate + assertCareAccess are the real guards. This is the PROVIDER training
// SERVICE — DISTINCT from the consumer self-Training tab.

const KIND_ICON = {
  one_on_one: User,
  group_class: Users,
  program: ClipboardList,
};

export default function ProviderTraining({ providerId }) {
  const { data: sessions, isLoading, isError, error } = useTrainingSessions(providerId);
  const { t, lang } = useProviderCopy(trainingCopy);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: COLORS.peach }}
        >
          <GraduationCap className="h-5 w-5" style={{ color: COLORS.terracotta }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#3B241B]">{t.title}</h1>
          <p className="text-sm text-[#7A6254]">{t.subtitle}</p>
        </div>
      </div>

      <CreateSessionForm providerId={providerId} />

      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-[#7A6254]">
        {t.listHeading}
      </h2>

      {isLoading ? (
        <div className="flex items-center gap-2 py-12 text-[#7A6254]">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: COLORS.coral }} />
          {t.loading}
        </div>
      ) : isError ? (
        <p className="py-8 text-sm text-[#B23B30]">
          {serverErrorMessage(error, lang, t.loadFailed, trainingCopy)}
        </p>
      ) : !sessions || sessions.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <SessionRow key={s.id} providerId={providerId} session={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  const { t } = useProviderCopy(trainingCopy);
  return (
    <div className="rounded-2xl border border-[#FFD9B3] bg-white p-10 text-center">
      <GraduationCap className="mx-auto h-8 w-8 text-[#B8A99D]" />
      <p className="mt-3 font-semibold text-[#3B241B]">{t.emptyTitle}</p>
      <p className="mt-1 text-sm text-[#7A6254]">{t.emptyBody}</p>
    </div>
  );
}

function CreateSessionForm({ providerId }) {
  const create = useCreateTrainingSession(providerId);
  const { t: copy, lang } = useProviderCopy(trainingCopy);
  const [kind, setKind] = useState("group_class");
  const [title, setTitle] = useState("");
  const [capacity, setCapacity] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    const name = title.trim();
    if (!name) {
      toast.error(copy.form.titleRequired);
      return;
    }
    const cap = parseWholeNumber(kind === "group_class" ? capacity : "", { min: 1 });
    if (cap.invalid) {
      toast.error(copy.form.capacityInvalid);
      return;
    }
    try {
      await create.mutateAsync({ kind, title: name, capacity: cap.value ?? null });
      setTitle("");
      setCapacity("");
      toast.success(copy.form.created);
    } catch (err) {
      toast.error(serverErrorMessage(err, lang, copy.form.createFailed, trainingCopy));
    }
  };

  const field =
    "rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-3 py-2 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]";

  return (
    <form onSubmit={submit} className="rounded-2xl border border-[#FFD9B3] bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <Plus className="h-4 w-4" style={{ color: COLORS.terracotta }} />
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#7A6254]">
          {copy.form.heading}
        </h2>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
          <option value="one_on_one">{copy.kinds.one_on_one}</option>
          <option value="group_class">{copy.kinds.group_class}</option>
          <option value="program">{copy.kinds.program}</option>
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={copy.form.titlePlaceholder}
          className={`flex-1 ${field}`}
        />
        {kind === "group_class" && (
          <input
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder={copy.form.capacityPlaceholder}
            inputMode="numeric"
            className={`w-28 ${field}`}
          />
        )}
        <button
          type="submit"
          disabled={create.isPending || !title.trim()}
          className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: COLORS.coral }}
        >
          <Plus className="h-4 w-4" />
          {copy.form.create}
        </button>
      </div>
    </form>
  );
}

function SessionRow({ providerId, session }) {
  const [showRoster, setShowRoster] = useState(false);
  const { t, lang } = useProviderCopy(trainingCopy);
  const kind = KIND_ICON[session.kind] ? session.kind : "one_on_one";
  const Icon = KIND_ICON[kind];
  const kindLabel = t.kinds[kind];
  const isClass = session.kind === "group_class";
  const seats =
    session.capacity != null
      ? plural(t.session.seats, session.capacity, lang, { taken: session.attendee_count ?? 0 })
      : plural(t.session.enrolled, session.attendee_count ?? 0, lang);

  return (
    <div className="rounded-2xl border border-[#FFD9B3] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" style={{ color: COLORS.terracotta }} />
          <div>
            <p className="font-bold text-[#3B241B]">{session.title || kindLabel}</p>
            <p className="mt-0.5 text-sm text-[#7A6254]">
              {kindLabel}
              {isClass ? ` · ${seats}` : ""}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowRoster((v) => !v)}
          className="flex items-center gap-1.5 rounded-xl border-2 border-[#FFD9B3] px-3 py-2 text-sm font-bold text-[#3B241B]"
        >
          <ClipboardList className="h-4 w-4" />
          {showRoster ? t.session.hide : t.session.logProgress}
        </button>
      </div>

      {showRoster && <Roster providerId={providerId} session={session} />}
    </div>
  );
}

function Roster({ providerId, session }) {
  const { data: roster, isLoading } = useTrainingProgress(providerId, session.id);
  const { t } = useProviderCopy(trainingCopy);

  return (
    <div className="mt-4 space-y-2 rounded-xl bg-[#FFF7EF] p-4">
      {isLoading ? (
        <p className="text-sm text-[#7A6254]">{t.roster.loading}</p>
      ) : !roster || roster.length === 0 ? (
        <p className="text-sm text-[#7A6254]">{t.roster.empty}</p>
      ) : (
        roster.map((r) => (
          <RosterRow key={r.id} providerId={providerId} row={r} />
        ))
      )}
    </div>
  );
}

function RosterRow({ providerId, row }) {
  const log = useLogTrainingProgress(providerId);
  const [note, setNote] = useState(row.progress_note || "");
  const { t, lang } = useProviderCopy(trainingCopy);

  const save = async (extra) => {
    try {
      await log.mutateAsync({ progress_id: row.id, ...extra });
      toast.success(t.roster.logged);
    } catch (err) {
      toast.error(serverErrorMessage(err, lang, t.roster.logFailed, trainingCopy));
    }
  };

  return (
    <div className="rounded-xl border border-[#FFD9B3] bg-white p-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-[#3B241B]">
          {row.pet_name || fill(t.roster.petFallback, { id: row.pet_id })}
        </p>
        <span className="text-xs font-semibold text-[#7A6254]">
          {t.roster.status[row.status] ?? row.status}
        </span>
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t.roster.notePlaceholder}
        rows={2}
        className="mt-2 w-full rounded-lg border-2 border-[#FFD9B3] bg-[#FFF7EF] px-3 py-2 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]"
      />
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => save({ progress_note: note, attended: true, status: "completed" })}
          disabled={log.isPending}
          className="rounded-lg px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: COLORS.coral }}
        >
          {t.roster.attendedSave}
        </button>
        <button
          onClick={() => save({ progress_note: note })}
          disabled={log.isPending}
          className="rounded-lg border-2 border-[#FFD9B3] px-3 py-1.5 text-sm font-bold text-[#3B241B]"
        >
          {t.roster.saveNote}
        </button>
      </div>
    </div>
  );
}

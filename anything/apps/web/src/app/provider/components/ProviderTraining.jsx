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

// /provider/training — the TRAINER's Training workspace (ticket 2.10). Manage 1:1 sessions,
// GROUP CLASSES (capacity), and PROGRAMS; log per-pet PROGRESS (attendance + notes + video
// lessons). All data flows through the already-built backend; RLS (0036) + the trainer
// capability gate + assertCareAccess are the real guards. This is the PROVIDER training
// SERVICE — DISTINCT from the consumer self-Training tab.

const KIND_LABEL = {
  one_on_one: { label: "1:1 session", Icon: User },
  group_class: { label: "Group class", Icon: Users },
  program: { label: "Program session", Icon: ClipboardList },
};

export default function ProviderTraining({ providerId }) {
  const { data: sessions, isLoading, isError, error } = useTrainingSessions(providerId);

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
          <h1 className="text-xl font-bold text-[#3B241B]">Training</h1>
          <p className="text-sm text-[#7A6254]">
            1:1 sessions, group classes, programs — and per-pet progress.
          </p>
        </div>
      </div>

      <CreateSessionForm providerId={providerId} />

      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-[#7A6254]">
        Sessions & classes
      </h2>

      {isLoading ? (
        <div className="flex items-center gap-2 py-12 text-[#7A6254]">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: COLORS.coral }} />
          Loading sessions…
        </div>
      ) : isError ? (
        <p className="py-8 text-sm text-[#B23B30]">
          {error?.message || "Couldn't load sessions."}
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
  return (
    <div className="rounded-2xl border border-[#FFD9B3] bg-white p-10 text-center">
      <GraduationCap className="mx-auto h-8 w-8 text-[#B8A99D]" />
      <p className="mt-3 font-semibold text-[#3B241B]">No sessions yet</p>
      <p className="mt-1 text-sm text-[#7A6254]">
        Create a 1:1 session, a group class, or a program session to get started.
      </p>
    </div>
  );
}

function CreateSessionForm({ providerId }) {
  const create = useCreateTrainingSession(providerId);
  const [kind, setKind] = useState("group_class");
  const [title, setTitle] = useState("");
  const [capacity, setCapacity] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) {
      toast.error("Give the session a title");
      return;
    }
    const cap =
      kind === "group_class" && capacity ? parseInt(capacity, 10) : null;
    if (cap != null && (!Number.isInteger(cap) || cap <= 0)) {
      toast.error("Capacity must be a positive number");
      return;
    }
    try {
      await create.mutateAsync({ kind, title: t, capacity: cap });
      setTitle("");
      setCapacity("");
      toast.success("Session created");
    } catch (err) {
      toast.error(err.message || "Couldn't create session");
    }
  };

  const field =
    "rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-3 py-2 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]";

  return (
    <form onSubmit={submit} className="rounded-2xl border border-[#FFD9B3] bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <Plus className="h-4 w-4" style={{ color: COLORS.terracotta }} />
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#7A6254]">
          New session / class
        </h2>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
          <option value="one_on_one">1:1 session</option>
          <option value="group_class">Group class</option>
          <option value="program">Program session</option>
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (e.g. Saturday Recall Class)"
          className={`flex-1 ${field}`}
        />
        {kind === "group_class" && (
          <input
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="Capacity"
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
          Create
        </button>
      </div>
    </form>
  );
}

function SessionRow({ providerId, session }) {
  const [showRoster, setShowRoster] = useState(false);
  const meta = KIND_LABEL[session.kind] || KIND_LABEL.one_on_one;
  const Icon = meta.Icon;
  const isClass = session.kind === "group_class";
  const seats =
    session.capacity != null
      ? `${session.attendee_count ?? 0} / ${session.capacity} seats`
      : `${session.attendee_count ?? 0} enrolled`;

  return (
    <div className="rounded-2xl border border-[#FFD9B3] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" style={{ color: COLORS.terracotta }} />
          <div>
            <p className="font-bold text-[#3B241B]">{session.title || meta.label}</p>
            <p className="mt-0.5 text-sm text-[#7A6254]">
              {meta.label}
              {isClass ? ` · ${seats}` : ""}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowRoster((v) => !v)}
          className="flex items-center gap-1.5 rounded-xl border-2 border-[#FFD9B3] px-3 py-2 text-sm font-bold text-[#3B241B]"
        >
          <ClipboardList className="h-4 w-4" />
          {showRoster ? "Hide" : "Log progress"}
        </button>
      </div>

      {showRoster && <Roster providerId={providerId} session={session} />}
    </div>
  );
}

function Roster({ providerId, session }) {
  const { data: roster, isLoading } = useTrainingProgress(providerId, session.id);

  return (
    <div className="mt-4 space-y-2 rounded-xl bg-[#FFF7EF] p-4">
      {isLoading ? (
        <p className="text-sm text-[#7A6254]">Loading roster…</p>
      ) : !roster || roster.length === 0 ? (
        <p className="text-sm text-[#7A6254]">
          No attendees with shared access yet. When an owner joins and grants you access,
          they appear here.
        </p>
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

  const save = async (extra) => {
    try {
      await log.mutateAsync({ progress_id: row.id, ...extra });
      toast.success("Progress logged");
    } catch (err) {
      toast.error(err.message || "Couldn't log progress");
    }
  };

  return (
    <div className="rounded-xl border border-[#FFD9B3] bg-white p-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-[#3B241B]">
          {row.pet_name || `Pet #${row.pet_id}`}
        </p>
        <span className="text-xs font-semibold text-[#7A6254]">{row.status}</span>
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Progress note (owner-visible)"
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
          Mark attended + save
        </button>
        <button
          onClick={() => save({ progress_note: note })}
          disabled={log.isPending}
          className="rounded-lg border-2 border-[#FFD9B3] px-3 py-1.5 text-sm font-bold text-[#3B241B]"
        >
          Save note
        </button>
      </div>
    </div>
  );
}

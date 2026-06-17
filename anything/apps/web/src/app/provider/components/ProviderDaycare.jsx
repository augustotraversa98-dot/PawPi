import { useState } from "react";
import {
  Home,
  Loader2,
  LogIn,
  LogOut,
  Ban,
  ShieldCheck,
  ShieldAlert,
  Syringe,
  Plus,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import {
  useDaycareStays,
  useDaycareStayAction,
  usePostReportCard,
  useDaycareRequirements,
  useAddDaycareRequirement,
  usePetVaccineCheck,
} from "../hooks/useProviders";
import { COLORS } from "../lib/colors";

// /provider/daycare — the facility's Daycare & Boarding workspace (ticket 2.8).
// Occupancy list (per-row check-in/out + cancel), daily report cards, required-vaccine
// config, and the CONSENT-GATED vaccine check. All data flows through the already-built
// backend; RLS (0034) + assertCareAccess are the real guards.

const STATUS_BADGE = {
  booked: { bg: "#FFF1E2", fg: "#B75D32", label: "Booked" },
  checked_in: { bg: "#E5F4EC", fg: "#1F7A4D", label: "Checked in" },
  checked_out: { bg: "#EFEAE6", fg: "#7A6254", label: "Checked out" },
  cancelled: { bg: "#FBE6E4", fg: "#B23B30", label: "Cancelled" },
};

function StatusBadge({ status }) {
  const s = STATUS_BADGE[status] || { bg: "#EFEAE6", fg: "#7A6254", label: status };
  return (
    <span
      className="inline-block rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

export default function ProviderDaycare({ providerId }) {
  const { data: stays, isLoading, isError, error } = useDaycareStays(providerId);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: COLORS.peach }}
        >
          <Home className="h-5 w-5" style={{ color: COLORS.terracotta }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#3B241B]">Daycare & Boarding</h1>
          <p className="text-sm text-[#7A6254]">
            Occupancy, check-in/out, report cards, and vaccine checks.
          </p>
        </div>
      </div>

      <RequirementsSection providerId={providerId} />

      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-[#7A6254]">
        Occupancy
      </h2>

      {isLoading ? (
        <div className="flex items-center gap-2 py-12 text-[#7A6254]">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: COLORS.coral }} />
          Loading stays…
        </div>
      ) : isError ? (
        <p className="py-8 text-sm text-[#B23B30]">
          {error?.message || "Couldn't load stays."}
        </p>
      ) : !stays || stays.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {stays.map((s) => (
            <StayRow key={s.id} providerId={providerId} stay={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-[#FFD9B3] bg-white p-10 text-center">
      <Home className="mx-auto h-8 w-8 text-[#B8A99D]" />
      <p className="mt-3 font-semibold text-[#3B241B]">No stays yet</p>
      <p className="mt-1 text-sm text-[#7A6254]">
        When owners book a stay with you, it appears here for check-in.
      </p>
    </div>
  );
}

function RequirementsSection({ providerId }) {
  const { data: requirements, isLoading } = useDaycareRequirements(providerId);
  const addReq = useAddDaycareRequirement(providerId);
  const [name, setName] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    const v = name.trim();
    if (!v) return;
    try {
      await addReq.mutateAsync({ vaccine_name: v });
      setName("");
      toast.success("Required vaccine added");
    } catch (err) {
      toast.error(err.message || "Couldn't add requirement");
    }
  };

  return (
    <div className="rounded-2xl border border-[#FFD9B3] bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <Syringe className="h-4 w-4" style={{ color: COLORS.terracotta }} />
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#7A6254]">
          Required vaccines
        </h2>
      </div>

      {isLoading ? (
        <p className="text-sm text-[#7A6254]">Loading…</p>
      ) : !requirements || requirements.length === 0 ? (
        <p className="text-sm text-[#7A6254]">
          No required vaccines yet. Add the vaccines you require for a stay.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {requirements
            .filter((r) => r.active)
            .map((r) => (
              <span
                key={r.id}
                className="rounded-full bg-[#FFF1E2] px-3 py-1 text-xs font-semibold text-[#B75D32]"
              >
                {r.vaccine_name}
              </span>
            ))}
        </div>
      )}

      <form onSubmit={submit} className="mt-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Rabies"
          className="flex-1 rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-3 py-2 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]"
        />
        <button
          type="submit"
          disabled={addReq.isPending || !name.trim()}
          className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: COLORS.coral }}
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </form>
    </div>
  );
}

function StayRow({ providerId, stay }) {
  const action = useDaycareStayAction(providerId);
  const [showCard, setShowCard] = useState(false);

  const run = async (a) => {
    try {
      await action.mutateAsync({ stayId: stay.id, action: a });
      toast.success(
        a === "check_in" ? "Checked in" : a === "check_out" ? "Checked out" : "Cancelled",
      );
    } catch (err) {
      toast.error(err.message || "Action failed");
    }
  };

  return (
    <div className="rounded-2xl border border-[#FFD9B3] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-bold text-[#3B241B]">{stay.pet_name || `Pet #${stay.pet_id}`}</p>
            <StatusBadge status={stay.status} />
          </div>
          <p className="mt-0.5 text-sm text-[#7A6254]">
            {stay.owner_name ? `${stay.owner_name} · ` : ""}
            {stay.start_date}
            {stay.end_date && stay.end_date !== stay.start_date ? ` → ${stay.end_date}` : ""}
            {stay.location_name ? ` · ${stay.location_name}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {stay.status === "booked" && (
            <button
              onClick={() => run("check_in")}
              disabled={action.isPending}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: COLORS.coral }}
            >
              <LogIn className="h-4 w-4" />
              Check in
            </button>
          )}
          {stay.status === "checked_in" && (
            <button
              onClick={() => run("check_out")}
              disabled={action.isPending}
              className="flex items-center gap-1.5 rounded-xl border-2 border-[#FFD9B3] px-3 py-2 text-sm font-bold text-[#3B241B]"
            >
              <LogOut className="h-4 w-4" />
              Check out
            </button>
          )}
          {(stay.status === "booked" || stay.status === "checked_in") && (
            <button
              onClick={() => run("cancel")}
              disabled={action.isPending}
              className="flex items-center gap-1.5 rounded-xl border-2 border-[#FBE6E4] px-3 py-2 text-sm font-bold text-[#B23B30]"
            >
              <Ban className="h-4 w-4" />
              Cancel
            </button>
          )}
          <button
            onClick={() => setShowCard((v) => !v)}
            className="flex items-center gap-1.5 rounded-xl border-2 border-[#FFD9B3] px-3 py-2 text-sm font-bold text-[#3B241B]"
          >
            <FileText className="h-4 w-4" />
            Report card
          </button>
        </div>
      </div>

      {/* Owner's feeding/med instructions. */}
      {(stay.feeding_instructions || stay.med_instructions) && (
        <div className="mt-3 rounded-xl bg-[#FFF7EF] p-3 text-sm text-[#3B241B]">
          {stay.feeding_instructions && <p>🍽️ {stay.feeding_instructions}</p>}
          {stay.med_instructions && <p className="mt-1">💊 {stay.med_instructions}</p>}
        </div>
      )}

      <VaccineCheck providerId={providerId} petId={stay.pet_id} locationId={stay.location_id} />

      {showCard && (
        <ReportCardForm
          providerId={providerId}
          stayId={stay.id}
          defaultDate={stay.start_date}
          onDone={() => setShowCard(false)}
        />
      )}
    </div>
  );
}

function VaccineCheck({ providerId, petId, locationId }) {
  const { data, isFetching, error, refetch } = usePetVaccineCheck(
    providerId,
    petId,
    locationId,
  );

  const run = async () => {
    try {
      await refetch({ throwOnError: true });
    } catch {
      // error surfaced via the query's error below
    }
  };

  return (
    <div className="mt-3">
      <button
        onClick={run}
        disabled={isFetching}
        className="flex items-center gap-1.5 text-sm font-semibold text-[#B75D32] disabled:opacity-50"
      >
        {isFetching ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Syringe className="h-4 w-4" />
        )}
        Check vaccines
      </button>

      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-[#B23B30]">
          <ShieldAlert className="h-4 w-4" />
          {error.status === 403
            ? "Owner consent needed to read vaccinations."
            : error.message}
        </p>
      )}

      {data && (
        <div className="mt-2 text-sm">
          {data.passed ? (
            <p className="flex items-center gap-1.5 font-semibold text-[#1F7A4D]">
              <ShieldCheck className="h-4 w-4" />
              {data.required.length === 0
                ? "No vaccines required"
                : "All required vaccines present"}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 font-semibold text-[#B23B30]">
              <ShieldAlert className="h-4 w-4" />
              Missing: {data.missing.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ReportCardForm({ providerId, stayId, defaultDate, onDone }) {
  const post = usePostReportCard(providerId);
  const [date, setDate] = useState(defaultDate || "");
  const [mood, setMood] = useState("");
  const [meals, setMeals] = useState("");
  const [activities, setActivities] = useState("");
  const [notes, setNotes] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!date) {
      toast.error("Pick a date for the card");
      return;
    }
    try {
      await post.mutateAsync({
        stayId,
        date,
        mood: mood || null,
        meals: meals || null,
        activities: activities || null,
        notes: notes || null,
      });
      toast.success("Report card posted");
      onDone?.();
    } catch (err) {
      toast.error(err.message || "Couldn't post card");
    }
  };

  const field =
    "w-full rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-3 py-2 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]";

  return (
    <form onSubmit={submit} className="mt-4 space-y-2 rounded-xl bg-[#FFF7EF] p-4">
      <label className="block text-xs font-semibold text-[#7A6254]">Date</label>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
      <input value={mood} onChange={(e) => setMood(e.target.value)} placeholder="Mood" className={field} />
      <input value={meals} onChange={(e) => setMeals(e.target.value)} placeholder="Meals" className={field} />
      <input
        value={activities}
        onChange={(e) => setActivities(e.target.value)}
        placeholder="Activities"
        className={field}
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes"
        className={field}
        rows={2}
      />
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={post.isPending}
          className="rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: COLORS.coral }}
        >
          Post card
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-xl border-2 border-[#FFD9B3] px-4 py-2 text-sm font-bold text-[#3B241B]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

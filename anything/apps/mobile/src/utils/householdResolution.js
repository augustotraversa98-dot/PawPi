// Which of a dog's reminders has the HOUSEHOLD already done (PR5b 1E)? The health logs are shared by everyone who cares
// for the dog, so when someone else logs a wellness check, a photo check or a care item, this phone can drop its own
// pending alarm for that instance — as soon as it reads the dog again (launch, dog select, foreground).
//
// Only the PERSISTENT types, with the same matching rules as the Today list (utils/reminderResolution). Feeding, walk
// and medication routines have no server link between a log and an instance (Phase 2). Vet appointments from the
// appointments list arm no local alarm, and a vet-appointment routine has no log to match.

import { buildResolutionIndex, isInstanceResolved, PERSISTENT_TYPES } from "@/utils/reminderResolution";
import { generateOverdueInstances } from "@/utils/reminderGenerator";

const LOOKBACK_DAYS = 30;

const SOURCES = {
  wellnessLogs: { path: "wellness-logs", pick: (d) => d.logs, limit: 200 },
  weightLogs: { path: "weight-logs", pick: (d) => d.logs, limit: 50 },
  medicalLogs: { path: "medical-care-logs", pick: (d) => d.logs, limit: 200 },
  photoChecks: { path: "photo-checks", pick: (d) => d.photoChecks, limit: 100 },
};

function sourceFor(reminder) {
  switch (reminder.type) {
    case "wellness_check":
      return reminder.checkType === "weight" ? "weightLogs" : "wellnessLogs";
    case "medical_care":
      return "medicalLogs";
    case "photo_check":
      return "photoChecks";
    default:
      return null;
  }
}

/**
 * The instances to check: the upcoming ones, plus past ones that still have a running snooze (their alarm is pending
 * although the forward generator no longer produces them).
 */
export function resolutionCandidates(generated, routines, snoozes = {}, now = new Date()) {
  const snoozed = new Set(
    Object.keys(snoozes).filter((id) => new Date(snoozes[id]).getTime() > now.getTime()),
  );
  const past =
    snoozed.size === 0
      ? []
      : (routines || [])
          .flatMap((r) => generateOverdueInstances(r, { lookbackDays: LOOKBACK_DAYS, now }))
          .filter((r) => snoozed.has(r.id));
  return [...(generated || []), ...past].filter(
    (r) => PERSISTENT_TYPES.has(r.type) && sourceFor(r) != null,
  );
}

/**
 * Read the logs these instances need and say which are done.
 * @returns {Promise<{ resolved: Set<string>, complete: boolean }>} `complete` is false when a read failed: what could not
 *   be checked is simply not in `resolved` (it keeps ringing, the safe failure).
 */
export async function fetchResolvedIds(petId, instances, now = new Date()) {
  const needed = [...new Set((instances || []).map(sourceFor).filter(Boolean))];
  if (petId == null || needed.length === 0) return { resolved: new Set(), complete: true };

  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rows = {};
  let complete = true;
  await Promise.all(
    needed.map(async (key) => {
      const { path, pick, limit } = SOURCES[key];
      try {
        const res = await fetch(`/api/health/${path}?petId=${petId}&limit=${limit}&since=${since}`);
        if (!res.ok) throw new Error(`${path}: ${res.status}`);
        rows[key] = pick(await res.json()) ?? [];
      } catch (error) {
        complete = false;
        console.warn("[householdResolution] could not read", path, error?.message);
      }
    }),
  );
  const index = buildResolutionIndex(rows);
  const resolved = new Set(
    (instances || []).filter((r) => isInstanceResolved(r, index)).map((r) => r.id),
  );
  return { resolved, complete };
}

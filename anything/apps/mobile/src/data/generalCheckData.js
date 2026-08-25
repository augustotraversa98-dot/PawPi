// General Check Data & Helper Functions
// This module manages general health check data

let generalChecks = [
  {
    id: "gc_001",
    timestamp: new Date("2026-05-04T19:30:00Z").getTime(),
    overallStatus: "some_changes",
    areas: {
      eyes: {
        status: "usual",
        changes: [],
        notes: "",
        photos: [],
      },
      ears: {
        status: "changed",
        changes: ["redness", "bad_smell"],
        notes: "Right ear seems a bit red and has slight odor",
        photos: [],
      },
      teeth_mouth: {
        status: "usual",
        changes: [],
        notes: "",
        photos: [],
      },
      skin_fur: {
        status: "usual",
        changes: [],
        notes: "",
        photos: [],
      },
      paws: {
        status: "usual",
        changes: [],
        notes: "",
        photos: [],
      },
      face: {
        status: "usual",
        changes: [],
        notes: "",
        photos: [],
      },
      mood: {
        status: "usual",
        changes: [],
        notes: "Happy and playful as always",
        photos: [],
      },
      energy: {
        status: "usual",
        changes: [],
        notes: "Normal energy levels",
        photos: [],
      },
    },
  },
  {
    id: "gc_002",
    timestamp: new Date("2026-04-28T10:15:00Z").getTime(),
    overallStatus: "all_usual",
    areas: {
      eyes: { status: "usual", changes: [], notes: "", photos: [] },
      ears: { status: "usual", changes: [], notes: "", photos: [] },
      teeth_mouth: { status: "usual", changes: [], notes: "", photos: [] },
      skin_fur: { status: "usual", changes: [], notes: "", photos: [] },
      paws: { status: "usual", changes: [], notes: "", photos: [] },
      face: { status: "usual", changes: [], notes: "", photos: [] },
      mood: { status: "usual", changes: [], notes: "", photos: [] },
      energy: { status: "usual", changes: [], notes: "", photos: [] },
    },
  },
];

// Area configuration
export const CHECK_AREAS = [
  {
    key: "eyes",
    label: "Eyes",
    emoji: "👁️",
    description: "Check for clarity, discharge, redness",
  },
  {
    key: "ears",
    label: "Ears",
    emoji: "👂",
    description: "Check for odor, discharge, redness",
  },
  {
    key: "teeth_mouth",
    label: "Teeth & Mouth",
    emoji: "🦷",
    description: "Check gums, teeth, breath",
  },
  {
    key: "skin_fur",
    label: "Skin & Fur",
    emoji: "🐾",
    description: "Check for bumps, irritation, hair loss",
  },
  {
    key: "paws",
    label: "Paws",
    emoji: "🐾",
    description: "Check pads, nails, between toes",
  },
  {
    key: "face",
    label: "Face",
    emoji: "😊",
    description: "Overall facial appearance",
  },
  {
    key: "mood",
    label: "Mood",
    emoji: "💭",
    description: "Behavior, responsiveness, playfulness",
  },
  {
    key: "energy",
    label: "Energy",
    emoji: "⚡",
    description: "Activity level, enthusiasm",
  },
];

// How many areas the light Care-Ring Quick Check suggests per day. A single knob —
// change to 1–3 to widen/narrow the daily nudge.
export const QUICK_SUGGESTION_COUNT = 2;

// Read an area's recorded status from ONE general-check row, tolerant of both shapes the
// API returns: the flat *_status columns (always written) and the additive `areas` jsonb
// (0118). Column/jsonb names differ from the CHECK_AREAS keys for two areas
// (teeth_mouth → teeth_status/teeth, skin_fur → skin_fur_status/skin), so map explicitly.
const AREA_FLAT_FIELD = {
  eyes: "eyes_status",
  ears: "ears_status",
  teeth_mouth: "teeth_status",
  skin_fur: "skin_fur_status",
  paws: "paws_status",
  face: "face_status",
  mood: "mood",
  energy: "energy",
};
const AREA_JSONB_KEY = {
  eyes: "eyes",
  ears: "ears",
  teeth_mouth: "teeth",
  skin_fur: "skin",
  paws: "paws",
  face: "face",
  mood: "mood",
  energy: "energy",
};

function areaStatusInRow(row, areaKey) {
  const flat = row?.[AREA_FLAT_FIELD[areaKey]];
  if (flat != null) return flat;
  const areas = row?.areas;
  if (areas && typeof areas === "object") {
    const a = areas[AREA_JSONB_KEY[areaKey]];
    if (a && a.status != null) return a.status;
  }
  return null;
}

// Local calendar day ("YYYY-MM-DD") for a check row's date. A bare date string is taken
// verbatim; a datetime is reduced to its LOCAL day (so it lines up with the owner-local
// `today` the caller passes). Rotation is a soft suggestion heuristic — never ring credit —
// so a rare timezone-boundary wobble here is harmless.
function rowDayString(row) {
  const v = row?.logged_at ?? row?.date ?? row?.timestamp ?? null;
  if (v == null) return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return typeof v === "string" ? v.slice(0, 10) : null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Choose today's suggested areas for the light Quick Check — a small rotating set so
// coverage moves day to day. Pure + unit-testable.
//   • `history`: the pet's general-check rows (newest-first or any order), from
//     GET /api/health/general-checks (flat *_status columns and/or `areas` jsonb).
//   • `count`: how many to suggest.
//   • `today`: owner-local "YYYY-MM-DD".
// Ranking: never-checked areas first, then least-recently-checked; an area already checked
// TODAY is pushed to the back (so it isn't re-suggested and rotates out tomorrow); the
// fixed CHECK_AREAS order is the stable tie-break (and the whole fallback for a new pet
// with no history). Returns an array of area keys, length ≤ count.
export function getSuggestedAreas(history, count = QUICK_SUGGESTION_COUNT, today) {
  const rows = Array.isArray(history) ? history : [];
  const lastDay = {}; // areaKey -> most recent "YYYY-MM-DD" that area carried a status
  for (const row of rows) {
    const day = rowDayString(row);
    if (!day) continue;
    for (const area of CHECK_AREAS) {
      if (areaStatusInRow(row, area.key) != null) {
        if (lastDay[area.key] == null || day > lastDay[area.key]) {
          lastDay[area.key] = day;
        }
      }
    }
  }

  const ranked = CHECK_AREAS.map((area, index) => {
    const last = lastDay[area.key] ?? null;
    return { key: area.key, last, checkedToday: last != null && last === today, index };
  }).sort((a, b) => {
    if (a.checkedToday !== b.checkedToday) return a.checkedToday ? 1 : -1;
    if (a.last !== b.last) {
      if (a.last == null) return -1; // never-checked first
      if (b.last == null) return 1;
      return a.last < b.last ? -1 : 1; // oldest first
    }
    return a.index - b.index; // stable fixed order
  });

  return ranked.slice(0, Math.max(0, count)).map((r) => r.key);
}

// Available change options
export const CHANGE_OPTIONS = [
  { key: "redness", label: "Redness", emoji: "🔴" },
  { key: "swelling", label: "Swelling", emoji: "💢" },
  { key: "discharge", label: "Discharge", emoji: "💧" },
  { key: "bad_smell", label: "Bad smell", emoji: "👃" },
  { key: "limping", label: "Limping", emoji: "🦶" },
  { key: "excessive_licking", label: "Excessive licking", emoji: "👅" },
  { key: "hair_loss", label: "Hair loss", emoji: "🔄" },
  { key: "wound", label: "Wound", emoji: "🩹" },
  { key: "other", label: "Other", emoji: "❓" },
];

// Get all general checks
export function getAllGeneralChecks() {
  return [...generalChecks].sort((a, b) => b.timestamp - a.timestamp);
}

// Get most recent general check
export function getLastGeneralCheck() {
  if (generalChecks.length === 0) return null;
  return [...generalChecks].sort((a, b) => b.timestamp - a.timestamp)[0];
}

// Get general checks from today
export function getTodayGeneralChecks() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTimestamp = today.getTime();

  return generalChecks.filter((check) => check.timestamp >= todayTimestamp);
}

// Get areas with changes from last check
export function getAreasWithChanges(check) {
  if (!check) return [];

  const areasWithChanges = [];
  Object.entries(check.areas).forEach(([key, area]) => {
    if (area.status === "changed") {
      const areaConfig = CHECK_AREAS.find((a) => a.key === key);
      if (areaConfig) {
        areasWithChanges.push({
          ...areaConfig,
          ...area,
        });
      }
    }
  });

  return areasWithChanges;
}

// Count areas with changes
export function getChangedAreasCount(check) {
  if (!check) return 0;
  return Object.values(check.areas).filter((area) => area.status === "changed")
    .length;
}

// Get change label
export function getChangeLabel(changeKey) {
  const option = CHANGE_OPTIONS.find((opt) => opt.key === changeKey);
  return option ? option.label : changeKey;
}

// Get change emoji
export function getChangeEmoji(changeKey) {
  const option = CHANGE_OPTIONS.find((opt) => opt.key === changeKey);
  return option ? option.emoji : "";
}

// Get overall status message
export function getOverallStatusMessage(check) {
  if (!check) return "";

  const changedCount = getChangedAreasCount(check);

  if (changedCount === 0) {
    return "Everything looks usual";
  } else if (changedCount === 1) {
    return "1 area with changes noted";
  } else {
    return `${changedCount} areas with changes noted`;
  }
}

// Add a new general check
export function addGeneralCheck(checkData) {
  const newCheck = {
    id: `gc_${Date.now()}`,
    timestamp: Date.now(),
    overallStatus: checkData.overallStatus || "all_usual",
    areas: checkData.areas || {},
  };

  generalChecks.unshift(newCheck);
  return newCheck;
}

// Get area configuration by key
export function getAreaConfig(areaKey) {
  return CHECK_AREAS.find((area) => area.key === areaKey);
}

// Format timestamp for display
export function formatCheckDate(timestamp) {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  } else if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  } else {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
    });
  }
}

// Format timestamp for time display
export function formatCheckTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// Check if there have been recent concerns (within 7 days)
export function hasRecentConcerns() {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentChecks = generalChecks.filter(
    (check) => check.timestamp >= sevenDaysAgo,
  );

  return recentChecks.some((check) => getChangedAreasCount(check) > 0);
}

// Get recommendation based on changes
export function getRecommendation(changes) {
  const seriousChanges = ["wound", "swelling", "discharge", "limping"];
  const hasSeriousChange = changes.some((change) =>
    seriousChanges.includes(change),
  );

  if (hasSeriousChange) {
    return "Consider contacting your veterinarian, especially if this persists or worsens.";
  } else if (changes.length > 2) {
    return "Monitor closely. If changes persist or worsen, contact your veterinarian.";
  } else if (changes.length > 0) {
    return "Keep an eye on this. Track any changes over the next few days.";
  }

  return "";
}

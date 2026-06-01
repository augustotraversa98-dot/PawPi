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

// Weight and Body Condition Tracking Data
// Helps owners and vets monitor long-term changes

// Weight entries
let weightEntries = [
  {
    id: "weight_001",
    timestamp: new Date("2026-05-06T09:30:00Z").getTime(),
    weight: 48.5, // in lbs
    weightUnit: "lbs",
    bodyShape: "ideal", // owner-friendly visual estimate
    notes: "Active and energetic as usual",
    photoUrl: null,
    // Vet fields (optional)
    bodyConditionScore: 5, // 1-9 scale
    muscleConditionScore: "normal", // normal, mild_loss, moderate_loss, severe_loss
    targetWeight: 48,
    vetNotes: "",
    enteredBy: "owner", // owner or vet
  },
  {
    id: "weight_002",
    timestamp: new Date("2026-04-06T10:15:00Z").getTime(),
    weight: 47.8,
    weightUnit: "lbs",
    bodyShape: "ideal",
    notes: "",
    photoUrl: null,
    bodyConditionScore: null,
    muscleConditionScore: null,
    targetWeight: null,
    vetNotes: "",
    enteredBy: "owner",
  },
  {
    id: "weight_003",
    timestamp: new Date("2026-03-06T14:20:00Z").getTime(),
    weight: 47.2,
    weightUnit: "lbs",
    bodyShape: "ideal",
    notes: "",
    photoUrl: null,
    bodyConditionScore: 5,
    muscleConditionScore: "normal",
    targetWeight: 48,
    vetNotes: "Healthy weight range. Continue current diet and exercise.",
    enteredBy: "vet",
  },
  {
    id: "weight_004",
    timestamp: new Date("2026-02-06T11:00:00Z").getTime(),
    weight: 46.5,
    weightUnit: "lbs",
    bodyShape: "lean",
    notes: "Recovered from illness",
    photoUrl: null,
    bodyConditionScore: null,
    muscleConditionScore: null,
    targetWeight: null,
    vetNotes: "",
    enteredBy: "owner",
  },
  {
    id: "weight_005",
    timestamp: new Date("2026-01-06T09:45:00Z").getTime(),
    weight: 46.0,
    weightUnit: "lbs",
    bodyShape: "lean",
    notes: "After stomach bug, eating normally again",
    photoUrl: null,
    bodyConditionScore: null,
    muscleConditionScore: null,
    targetWeight: null,
    vetNotes: "",
    enteredBy: "owner",
  },
];

// Body shape options (owner-friendly)
export const BODY_SHAPES = [
  {
    key: "too_thin",
    label: "Too thin",
    emoji: "🦴",
    description: "Ribs, spine, and hip bones very visible",
    color: "#FFB74D",
  },
  {
    key: "lean",
    label: "Lean",
    emoji: "🏃",
    description: "Ribs easily felt, visible waist",
    color: "#81C784",
  },
  {
    key: "ideal",
    label: "Ideal-looking",
    emoji: "✨",
    description: "Ribs felt with slight pressure, clear waist",
    color: "#66BB6A",
  },
  {
    key: "a_little_heavy",
    label: "A little heavy",
    emoji: "🍖",
    description: "Ribs hard to feel, waist less defined",
    color: "#FFB74D",
  },
  {
    key: "heavy",
    label: "Heavy",
    emoji: "🛋️",
    description: "Hard to feel ribs, no visible waist",
    color: "#E57373",
  },
];

// Muscle Condition Score options
export const MUSCLE_CONDITION_SCORES = [
  { key: "normal", label: "Normal", description: "No muscle loss" },
  {
    key: "mild_loss",
    label: "Mild loss",
    description: "Minimal muscle wasting",
  },
  {
    key: "moderate_loss",
    label: "Moderate loss",
    description: "Noticeable muscle wasting",
  },
  {
    key: "severe_loss",
    label: "Severe loss",
    description: "Significant muscle wasting",
  },
];

// Get all weight entries
export function getWeightEntries() {
  return [...weightEntries].sort((a, b) => b.timestamp - a.timestamp);
}

// Get most recent weight entry
export function getCurrentWeight() {
  const entries = getWeightEntries();
  return entries.length > 0 ? entries[0] : null;
}

// Get previous weight entry
export function getPreviousWeight() {
  const entries = getWeightEntries();
  return entries.length > 1 ? entries[1] : null;
}

// Get weight change
export function getWeightChange() {
  const current = getCurrentWeight();
  const previous = getPreviousWeight();

  if (!current || !previous) {
    return null;
  }

  const change = current.weight - previous.weight;
  const percentChange = ((change / previous.weight) * 100).toFixed(1);

  return {
    change: change.toFixed(1),
    percentChange,
    direction: change > 0 ? "up" : change < 0 ? "down" : "stable",
    current: current.weight,
    previous: previous.weight,
  };
}

// Get target weight (most recent vet entry with target)
export function getTargetWeight() {
  const entries = getWeightEntries();
  const vetEntry = entries.find(
    (entry) => entry.targetWeight !== null && entry.targetWeight !== undefined,
  );
  return vetEntry ? vetEntry.targetWeight : null;
}

// Get most recent BCS (Body Condition Score)
export function getCurrentBCS() {
  const entries = getWeightEntries();
  const bcsEntry = entries.find(
    (entry) =>
      entry.bodyConditionScore !== null &&
      entry.bodyConditionScore !== undefined,
  );
  return bcsEntry ? bcsEntry.bodyConditionScore : null;
}

// Get weight trend (last 6 months)
export function getWeightTrend() {
  const sixMonthsAgo = Date.now() - 6 * 30 * 24 * 60 * 60 * 1000;
  const recentEntries = weightEntries
    .filter((entry) => entry.timestamp >= sixMonthsAgo)
    .sort((a, b) => a.timestamp - b.timestamp);

  return recentEntries.map((entry) => ({
    timestamp: entry.timestamp,
    weight: entry.weight,
    date: formatDate(entry.timestamp),
  }));
}

// Calculate weight trend direction (over last 3 months)
export function getWeightTrendDirection() {
  const threeMonthsAgo = Date.now() - 3 * 30 * 24 * 60 * 60 * 1000;
  const recentEntries = weightEntries
    .filter((entry) => entry.timestamp >= threeMonthsAgo)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (recentEntries.length < 2) {
    return { direction: "stable", label: "Stable", emoji: "↔️" };
  }

  const oldest = recentEntries[0];
  const newest = recentEntries[recentEntries.length - 1];
  const change = newest.weight - oldest.weight;
  const percentChange = Math.abs((change / oldest.weight) * 100);

  // Consider changes less than 2% as stable
  if (percentChange < 2) {
    return { direction: "stable", label: "Stable", emoji: "↔️", change };
  }

  if (change > 0) {
    return {
      direction: "increasing",
      label: "Increasing",
      emoji: "↗️",
      change,
    };
  }

  return { direction: "decreasing", label: "Decreasing", emoji: "↘️", change };
}

// Add new weight entry
export function addWeightEntry(entryData) {
  const newEntry = {
    id: `weight_${Date.now()}`,
    timestamp: entryData.timestamp || Date.now(),
    weight: entryData.weight,
    weightUnit: entryData.weightUnit || "lbs",
    bodyShape: entryData.bodyShape || "ideal",
    notes: entryData.notes || "",
    photoUrl: entryData.photoUrl || null,
    bodyConditionScore: entryData.bodyConditionScore || null,
    muscleConditionScore: entryData.muscleConditionScore || null,
    targetWeight: entryData.targetWeight || null,
    vetNotes: entryData.vetNotes || "",
    enteredBy: entryData.enteredBy || "owner",
  };

  weightEntries.unshift(newEntry);
  return newEntry;
}

// Update weight entry
export function updateWeightEntry(entryId, updates) {
  const index = weightEntries.findIndex((entry) => entry.id === entryId);
  if (index !== -1) {
    weightEntries[index] = { ...weightEntries[index], ...updates };
    return weightEntries[index];
  }
  return null;
}

// Delete weight entry
export function deleteWeightEntry(entryId) {
  const index = weightEntries.findIndex((entry) => entry.id === entryId);
  if (index !== -1) {
    const deleted = weightEntries.splice(index, 1)[0];
    return deleted;
  }
  return null;
}

// Get body shape label
export function getBodyShapeLabel(shapeKey) {
  const shape = BODY_SHAPES.find((s) => s.key === shapeKey);
  return shape ? shape.label : shapeKey;
}

// Get body shape emoji
export function getBodyShapeEmoji(shapeKey) {
  const shape = BODY_SHAPES.find((s) => s.key === shapeKey);
  return shape ? shape.emoji : "📊";
}

// Get body shape color
export function getBodyShapeColor(shapeKey) {
  const shape = BODY_SHAPES.find((s) => s.key === shapeKey);
  return shape ? shape.color : "#9E9E9E";
}

// Get muscle condition label
export function getMuscleConditionLabel(scoreKey) {
  const score = MUSCLE_CONDITION_SCORES.find((s) => s.key === scoreKey);
  return score ? score.label : scoreKey;
}

// Format date for display
export function formatDate(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Format date for short display (no year if current year)
export function formatDateShort(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const isCurrentYear = date.getFullYear() === now.getFullYear();

  if (isCurrentYear) {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Calculate days between entries
export function getDaysBetween(timestamp1, timestamp2) {
  const diff = Math.abs(timestamp1 - timestamp2);
  return Math.round(diff / (24 * 60 * 60 * 1000));
}

// Get BCS interpretation (1-9 scale)
export function getBCSInterpretation(score) {
  if (score === null || score === undefined) return null;

  if (score <= 2) {
    return {
      label: "Very thin",
      description: "Ribs, spine, and bones easily visible",
      color: "#FFB74D",
    };
  }
  if (score <= 3) {
    return {
      label: "Underweight",
      description: "Ribs easily felt, minimal fat",
      color: "#81C784",
    };
  }
  if (score <= 5) {
    return {
      label: "Ideal",
      description: "Ribs felt with slight pressure, visible waist",
      color: "#66BB6A",
    };
  }
  if (score <= 7) {
    return {
      label: "Overweight",
      description: "Ribs hard to feel, waist less defined",
      color: "#FFB74D",
    };
  }
  return {
    label: "Obese",
    description: "Hard to feel ribs, no visible waist",
    color: "#E57373",
  };
}

// Check if weight is at target
export function isAtTargetWeight() {
  const current = getCurrentWeight();
  const target = getTargetWeight();

  if (!current || !target) return null;

  const diff = Math.abs(current.weight - target);
  const percentDiff = (diff / target) * 100;

  // Within 3% of target is considered "at target"
  if (percentDiff <= 3) {
    return { status: "at_target", label: "At target", color: "#66BB6A" };
  }

  if (current.weight > target) {
    return { status: "above_target", label: "Above target", color: "#FFB74D" };
  }

  return { status: "below_target", label: "Below target", color: "#81C784" };
}

// Get weight history for chart (monthly averages for cleaner chart)
export function getMonthlyWeightAverages() {
  const grouped = {};

  weightEntries.forEach((entry) => {
    const date = new Date(entry.timestamp);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    if (!grouped[key]) {
      grouped[key] = { total: 0, count: 0, timestamp: entry.timestamp };
    }

    grouped[key].total += entry.weight;
    grouped[key].count += 1;
  });

  return Object.keys(grouped)
    .map((key) => ({
      month: key,
      weight: grouped[key].total / grouped[key].count,
      timestamp: grouped[key].timestamp,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

// Get entries from last X days
export function getRecentEntries(days = 30) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return weightEntries
    .filter((entry) => entry.timestamp >= cutoff)
    .sort((a, b) => b.timestamp - a.timestamp);
}

// Export for Timeline integration
export function getTodayWeightLogs() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTimestamp = today.getTime();

  return weightEntries.filter((entry) => {
    const entryDate = new Date(entry.timestamp);
    entryDate.setHours(0, 0, 0, 0);
    return entryDate.getTime() === todayTimestamp;
  });
}

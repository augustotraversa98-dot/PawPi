// Mock data and state for Vomit/Digestive Event tracking
// In a production app, this would be connected to a database

export const vomitLogs = [
  {
    id: "vomit001",
    petId: "sample-pet",
    timestamp: "2026-05-06T10:30:00Z",
    episodes: 1,
    appearance: "foam",
    relationToFood: "before meal",
    appetiteAfter: "normal",
    energy: "normal",
    diarrheaPresent: false,
    photoUrl: null,
    notes: "",
    isQuickLog: true,
  },
  {
    id: "vomit002",
    petId: "sample-pet",
    timestamp: "2026-05-05T14:20:00Z",
    episodes: 2,
    appearance: "bile/yellow",
    relationToFood: "unknown",
    appetiteAfter: "reduced",
    energy: "low",
    diarrheaPresent: false,
    photoUrl: null,
    notes: "Seemed uncomfortable before vomiting",
    isQuickLog: false,
  },
  {
    id: "vomit003",
    petId: "sample-pet",
    timestamp: "2026-05-03T08:15:00Z",
    episodes: 1,
    appearance: "food",
    relationToFood: "after meal",
    appetiteAfter: "normal",
    energy: "normal",
    diarrheaPresent: false,
    photoUrl: null,
    notes: "Ate too fast",
    isQuickLog: false,
  },
];

// Default vomit log for quick logging
export const defaultVomit = {
  episodes: 1,
  appearance: "foam",
  relationToFood: "unknown",
  appetiteAfter: "normal",
  energy: "normal",
  diarrheaPresent: false,
  photoUrl: null,
  notes: "",
};

// Helper functions
export const getTodayVomitLogs = () => {
  const today = new Date().toISOString().split("T")[0];
  return vomitLogs.filter((log) => log.timestamp.startsWith(today));
};

export const getLastVomitLog = () => {
  return vomitLogs.sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
  )[0];
};

export const getVomitCountToday = () => {
  return getTodayVomitLogs().length;
};

export const getTotalEpisodesToday = () => {
  return getTodayVomitLogs().reduce((sum, log) => sum + log.episodes, 0);
};

export const getRecentSymptoms = () => {
  const recentLogs = vomitLogs
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 3);

  const symptoms = {
    lowEnergy: false,
    diarrhea: false,
    refusedFood: false,
    reducedAppetite: false,
  };

  recentLogs.forEach((log) => {
    if (log.energy === "low" || log.energy === "very low") {
      symptoms.lowEnergy = true;
    }
    if (log.diarrheaPresent) {
      symptoms.diarrhea = true;
    }
    if (log.appetiteAfter === "refused food") {
      symptoms.refusedFood = true;
    }
    if (log.appetiteAfter === "reduced") {
      symptoms.reducedAppetite = true;
    }
  });

  return symptoms;
};

export const hasRecentConcerns = () => {
  const recentLogs = vomitLogs
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 3);

  const concerns = {
    repeatedVomiting: false,
    blood: false,
    veryLowEnergy: false,
    vomitingWithDiarrhea: false,
  };

  // Check for repeated vomiting (multiple episodes in one log OR multiple logs today)
  const todayLogs = getTodayVomitLogs();
  const totalEpisodesToday = getTotalEpisodesToday();

  if (todayLogs.length >= 2 || totalEpisodesToday >= 3) {
    concerns.repeatedVomiting = true;
  }

  recentLogs.forEach((log) => {
    if (log.appearance === "blood") {
      concerns.blood = true;
    }
    if (log.energy === "very low") {
      concerns.veryLowEnergy = true;
    }
    if (log.diarrheaPresent) {
      concerns.vomitingWithDiarrhea = true;
    }
  });

  return concerns;
};

export const getConcernMessage = (concerns) => {
  const issues = [];
  if (concerns.repeatedVomiting) issues.push("repeated vomiting");
  if (concerns.blood) issues.push("blood in vomit");
  if (concerns.veryLowEnergy) issues.push("very low energy");
  if (concerns.vomitingWithDiarrhea) issues.push("vomiting with diarrhea");

  if (issues.length === 0) return null;

  return {
    issues,
    message:
      "This may need veterinary attention, especially if repeated, severe, or combined with low energy, diarrhea, pain, or refusal to eat.",
    urgent:
      concerns.blood || concerns.veryLowEnergy || concerns.vomitingWithDiarrhea,
  };
};

// Add new vomit log
export const addVomitLog = (logData) => {
  const newLog = {
    id: `vomit${Date.now()}`,
    petId: "sample-pet",
    timestamp: new Date().toISOString(),
    ...logData,
  };
  vomitLogs.unshift(newLog);
  return newLog;
};

// Get appearance label with emoji
export const getAppearanceLabel = (appearance) => {
  const labels = {
    food: "🍖 Food",
    foam: "💨 Foam",
    "bile/yellow": "🟡 Bile/Yellow",
    "clear liquid": "💧 Clear liquid",
    blood: "🔴 Blood",
    other: "⚫ Other",
  };
  return labels[appearance] || appearance;
};

// Get appearance indicator emoji only
export const getAppearanceIndicator = (appearance) => {
  const indicators = {
    food: "🍖",
    foam: "💨",
    "bile/yellow": "🟡",
    "clear liquid": "💧",
    blood: "🔴",
    other: "⚫",
  };
  return indicators[appearance] || "⚫";
};

// Get energy level label
export const getEnergyLabel = (energy) => {
  const labels = {
    normal: "Normal energy",
    low: "Low energy",
    "very low": "Very low energy",
  };
  return labels[energy] || energy;
};

// Get energy color
export const getEnergyColor = (energy) => {
  const colors = {
    normal: "#A7BFA3", // sage green
    low: "#FFB74D", // orange
    "very low": "#FF5733", // red
  };
  return colors[energy] || "#A7BFA3";
};

// Check if log has urgent concerns
export const logHasUrgentConcerns = (log) => {
  return (
    log.appearance === "blood" ||
    log.energy === "very low" ||
    log.diarrheaPresent ||
    log.episodes >= 3
  );
};

// Check if log has any concerns
export const logHasConcerns = (log) => {
  return (
    logHasUrgentConcerns(log) ||
    log.energy === "low" ||
    log.appetiteAfter === "refused food" ||
    log.episodes >= 2
  );
};

// Format relation to food
export const formatRelationToFood = (relation) => {
  const formatted = {
    "before meal": "Before meal",
    "after meal": "After meal",
    unknown: "Unknown timing",
  };
  return formatted[relation] || relation;
};

// Format appetite after
export const formatAppetiteAfter = (appetite) => {
  const formatted = {
    normal: "Normal appetite",
    reduced: "Reduced appetite",
    "refused food": "Refused food",
  };
  return formatted[appetite] || appetite;
};

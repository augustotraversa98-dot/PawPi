// Mock data and state for Pee tracking
// In a production app, this would be connected to a database

export const peeLogs = [
  {
    id: "pee001",
    petId: "phoebe",
    timestamp: "2026-05-06T09:15:00Z",
    volume: "normal",
    color: "yellow",
    accident: false,
    difficulty: false,
    pain: false,
    blood: false,
    increasedThirst: false,
    notes: "",
    isDefault: true,
  },
  {
    id: "pee002",
    petId: "phoebe",
    timestamp: "2026-05-06T06:45:00Z",
    volume: "normal",
    color: "yellow",
    accident: false,
    difficulty: false,
    pain: false,
    blood: false,
    increasedThirst: false,
    notes: "",
    isDefault: true,
  },
  {
    id: "pee003",
    petId: "phoebe",
    timestamp: "2026-05-05T20:30:00Z",
    volume: "large",
    color: "pale",
    accident: false,
    difficulty: false,
    pain: false,
    blood: false,
    increasedThirst: true,
    notes: "Drinking more water today",
    isDefault: false,
  },
  {
    id: "pee004",
    petId: "phoebe",
    timestamp: "2026-05-05T14:20:00Z",
    volume: "small",
    color: "dark",
    accident: false,
    difficulty: false,
    pain: false,
    blood: false,
    increasedThirst: false,
    notes: "After long walk",
    isDefault: false,
  },
  {
    id: "pee005",
    petId: "phoebe",
    timestamp: "2026-05-05T07:00:00Z",
    volume: "normal",
    color: "yellow",
    accident: false,
    difficulty: false,
    pain: false,
    blood: false,
    increasedThirst: false,
    notes: "",
    isDefault: true,
  },
];

// Default pee log
export const defaultPee = {
  volume: "normal",
  color: "yellow",
  accident: false,
  difficulty: false,
  pain: false,
  blood: false,
  increasedThirst: false,
  notes: "",
};

// Helper functions
export const getTodayPeeLogs = () => {
  const today = new Date().toISOString().split("T")[0];
  return peeLogs.filter((log) => log.timestamp.startsWith(today));
};

export const getLastPeeLog = () => {
  return peeLogs.sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
  )[0];
};

export const getPeeCountToday = () => {
  return getTodayPeeLogs().length;
};

export const getTodayAccidents = () => {
  return getTodayPeeLogs().filter((log) => log.accident).length;
};

export const getRecentVolume = () => {
  const recent = getTodayPeeLogs();
  if (recent.length === 0) return null;
  return recent[recent.length - 1].volume;
};

export const getRecentColor = () => {
  const recent = getTodayPeeLogs();
  if (recent.length === 0) return null;
  return recent[recent.length - 1].color;
};

export const hasRecentConcerns = () => {
  const recentLogs = peeLogs
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 3);

  const concerns = {
    blood: false,
    difficulty: false,
    pain: false,
    repeatedAccidents: false,
  };

  let accidentCount = 0;

  recentLogs.forEach((log) => {
    if (log.blood) concerns.blood = true;
    if (log.difficulty) concerns.difficulty = true;
    if (log.pain) concerns.pain = true;
    if (log.accident) accidentCount++;
  });

  if (accidentCount >= 2) concerns.repeatedAccidents = true;

  return concerns;
};

export const getConcernMessage = (concerns) => {
  const issues = [];
  if (concerns.blood) issues.push("blood visible");
  if (concerns.difficulty) issues.push("difficulty peeing");
  if (concerns.pain) issues.push("pain or crying");
  if (concerns.repeatedAccidents) issues.push("repeated accidents");

  if (issues.length === 0) return null;

  return {
    issues,
    message:
      "This may be worth discussing with a veterinarian. Seek professional care if your dog seems unable to pee, is painful, or symptoms continue.",
    urgent: concerns.difficulty || concerns.pain, // Flag for more urgent concerns
  };
};

// Add new pee log
export const addPeeLog = (logData) => {
  const newLog = {
    id: `pee${Date.now()}`,
    petId: "phoebe",
    timestamp: new Date().toISOString(),
    ...logData,
  };
  peeLogs.unshift(newLog);
  return newLog;
};

// Get volume label with emoji
export const getVolumeLabel = (volume) => {
  const labels = {
    small: "💧 Small",
    normal: "✅ Normal",
    large: "💦 Large",
  };
  return labels[volume] || volume;
};

// Get color indicator
export const getColorIndicator = (color) => {
  const colors = {
    pale: "⚪",
    yellow: "🟡",
    dark: "🟤",
    "red/pink": "🔴",
    other: "⚫",
  };
  return colors[color] || "⚫";
};

// Get color label
export const getColorLabel = (color) => {
  return color.charAt(0).toUpperCase() + color.slice(1);
};

// Check if log has concerns
export const logHasConcerns = (log) => {
  return log.blood || log.difficulty || log.pain;
};

// Check if recent accidents (2+ in last 3 logs)
export const hasRepeatedAccidents = () => {
  const recentLogs = peeLogs
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 3);

  const accidentCount = recentLogs.filter((log) => log.accident).length;
  return accidentCount >= 2;
};

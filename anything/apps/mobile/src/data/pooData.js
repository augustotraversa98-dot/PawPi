// Mock data and state for Poo tracking
// In a production app, this would be connected to a database

export const pooLogs = [
  {
    id: "poo001",
    petId: "phoebe",
    timestamp: "2026-05-06T08:30:00Z",
    amount: "medium",
    shape: "soft",
    color: "brown",
    blood: false,
    mucus: false,
    effort: "none",
    accident: false,
    photoUrl: null,
    notes: "Softer than usual",
    isDefault: false,
  },
  {
    id: "poo002",
    petId: "phoebe",
    timestamp: "2026-05-06T06:20:00Z",
    amount: "medium",
    shape: "normal",
    color: "brown",
    blood: false,
    mucus: false,
    effort: "none",
    accident: false,
    photoUrl: null,
    notes: "",
    isDefault: true,
  },
  {
    id: "poo003",
    petId: "phoebe",
    timestamp: "2026-05-05T19:15:00Z",
    amount: "medium",
    shape: "normal",
    color: "brown",
    blood: false,
    mucus: false,
    effort: "none",
    accident: false,
    photoUrl: null,
    notes: "",
    isDefault: true,
  },
  {
    id: "poo004",
    petId: "phoebe",
    timestamp: "2026-05-05T07:30:00Z",
    amount: "large",
    shape: "soft",
    color: "brown",
    blood: false,
    mucus: false,
    effort: "mild",
    accident: false,
    photoUrl: null,
    notes: "After morning walk",
    isDefault: false,
  },
];

// Default poo log
export const defaultPoo = {
  amount: "medium",
  shape: "normal",
  color: "brown",
  blood: false,
  mucus: false,
  effort: "none",
  accident: false,
  notes: "",
};

// Helper functions
export const getTodayPooLogs = () => {
  const today = new Date().toISOString().split("T")[0];
  return pooLogs.filter((log) => log.timestamp.startsWith(today));
};

export const getLastPooLog = () => {
  return pooLogs.sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
  )[0];
};

export const getPooCountToday = () => {
  return getTodayPooLogs().length;
};

export const getRecentConsistency = () => {
  const recent = getTodayPooLogs();
  if (recent.length === 0) return null;
  return recent[recent.length - 1].shape;
};

export const hasRecentConcerns = () => {
  const recentLogs = pooLogs
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 3);

  const concerns = {
    blood: false,
    blackStool: false,
    liquidStool: false,
    strongStraining: false,
  };

  recentLogs.forEach((log) => {
    if (log.blood) concerns.blood = true;
    if (log.color === "black") concerns.blackStool = true;
    if (log.shape === "liquid") concerns.liquidStool = true;
    if (log.effort === "strong") concerns.strongStraining = true;
  });

  return concerns;
};

export const getConcernMessage = (concerns) => {
  const issues = [];
  if (concerns.blood) issues.push("blood");
  if (concerns.blackStool) issues.push("black stool");
  if (concerns.liquidStool) issues.push("liquid stool");
  if (concerns.strongStraining) issues.push("strong straining");

  if (issues.length === 0) return null;

  return {
    issues,
    message:
      "This may be worth discussing with a veterinarian, especially if it continues, worsens, or comes with vomiting, pain, or low energy.",
  };
};

// Add new poo log
export const addPooLog = (logData) => {
  const newLog = {
    id: `poo${Date.now()}`,
    petId: "phoebe",
    timestamp: new Date().toISOString(),
    ...logData,
  };
  pooLogs.unshift(newLog);
  return newLog;
};

// Get poo logs with photos
export const getPooLogsWithPhotos = () => {
  return pooLogs.filter((log) => log.photoUrl !== null);
};

// Get shape label with emoji
export const getShapeLabel = (shape) => {
  const labels = {
    hard: "💎 Hard",
    normal: "✅ Normal",
    soft: "🌊 Soft",
    liquid: "💧 Liquid",
  };
  return labels[shape] || shape;
};

// Get color indicator
export const getColorIndicator = (color) => {
  const colors = {
    brown: "🟤",
    yellow: "🟡",
    green: "🟢",
    black: "⚫",
    red: "🔴",
    other: "⚪",
  };
  return colors[color] || "⚪";
};

// Check if log has concerns
export const logHasConcerns = (log) => {
  return (
    log.blood ||
    log.color === "black" ||
    log.shape === "liquid" ||
    log.effort === "strong"
  );
};

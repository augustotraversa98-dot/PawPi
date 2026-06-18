// Mock data and state for Walk, Activity, and Mobility tracking
// In a production app, this would be connected to a database

export const walkLogs = [
  {
    id: "walk001",
    petId: "sample-pet",
    timestamp: "2026-05-06T07:30:00Z",
    duration: 25, // minutes
    distance: 1.2, // miles
    pace: "normal",
    energyAfter: "high",
    pottyEvents: {
      poo: 1,
      pee: 2,
    },
    route: "Park loop",
    location: "Riverside Park",
    notes: "Met some friendly dogs, enjoyed the sunshine",
    isActive: false, // false means walk completed
  },
  {
    id: "walk002",
    petId: "sample-pet",
    timestamp: "2026-05-05T18:15:00Z",
    duration: 15,
    distance: 0.7,
    pace: "relaxed",
    energyAfter: "normal",
    pottyEvents: {
      poo: 0,
      pee: 1,
    },
    route: "Evening stroll",
    location: "Around the block",
    notes: "",
    isActive: false,
  },
  {
    id: "walk003",
    petId: "sample-pet",
    timestamp: "2026-05-05T07:00:00Z",
    duration: 30,
    distance: 1.5,
    pace: "active",
    energyAfter: "high",
    pottyEvents: {
      poo: 1,
      pee: 3,
    },
    route: "Trail run",
    location: "Forest Trail",
    notes: "Lots of energy, ran part of the way",
    isActive: false,
  },
];

export const mobilityChecks = [
  {
    id: "mobility001",
    petId: "sample-pet",
    timestamp: "2026-05-04T16:20:00Z",
    limping: false,
    stiffness: true,
    difficultyStanding: false,
    difficultyStairsJumping: false,
    painSigns: false,
    notes: "Slight stiffness after long nap, resolved after moving around",
  },
  {
    id: "mobility002",
    petId: "sample-pet",
    timestamp: "2026-05-02T09:30:00Z",
    limping: false,
    stiffness: false,
    difficultyStanding: false,
    difficultyStairsJumping: false,
    painSigns: false,
    notes: "All movement looks normal",
  },
];

export const socialWalks = [
  {
    id: "social001",
    petId: "sample-pet",
    hostName: "Your pet",
    date: "2026-05-08",
    time: "10:00 AM",
    meetingLocation: "Riverside Park - Main Entrance",
    duration: 45,
    pace: "normal",
    visibility: "nearby pets",
    maxPets: 5,
    notes: "Bringing tennis balls for playtime!",
    attendees: [
      { petName: "Max", ownerName: "Sarah" },
      { petName: "Luna", ownerName: "James" },
    ],
  },
  {
    id: "social002",
    petId: "sample-pet",
    hostName: "Charlie",
    date: "2026-05-10",
    time: "5:30 PM",
    meetingLocation: "Dog Beach",
    duration: 60,
    pace: "relaxed",
    visibility: "friends only",
    maxPets: 3,
    notes: "Beach walk at sunset",
    attendees: [
      { petName: "Your pet", ownerName: "You" },
      { petName: "Bella", ownerName: "Mike" },
    ],
  },
];

export const activeWalk = null; // Will hold an active walk session

// Default walk configuration
export const defaultWalk = {
  duration: 20,
  distance: 1.0,
  pace: "normal",
  energyAfter: "normal",
  pottyEvents: {
    poo: 0,
    pee: 0,
  },
  route: "",
  location: "",
  notes: "",
};

// Helper functions
export const getTodayWalkLogs = () => {
  const today = new Date().toISOString().split("T")[0];
  return walkLogs.filter((log) => log.timestamp.startsWith(today));
};

export const getLastWalkLog = () => {
  return walkLogs.sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
  )[0];
};

export const getWalkCountToday = () => {
  return getTodayWalkLogs().length;
};

export const getTotalDurationToday = () => {
  return getTodayWalkLogs().reduce((sum, log) => sum + log.duration, 0);
};

export const getTotalDistanceToday = () => {
  return getTodayWalkLogs().reduce((sum, log) => sum + log.distance, 0);
};

export const getLastMobilityCheck = () => {
  return mobilityChecks.sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
  )[0];
};

export const hasRecentMobilityIssues = () => {
  const recentChecks = mobilityChecks
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 3);

  const issues = {
    limping: false,
    painSigns: false,
    suddenChange: false,
    difficultyMoving: false,
  };

  recentChecks.forEach((check) => {
    if (check.limping) issues.limping = true;
    if (check.painSigns) issues.painSigns = true;
    if (check.difficultyStanding || check.difficultyStairsJumping) {
      issues.difficultyMoving = true;
    }
  });

  // Check for sudden change (recent issue after no issues)
  if (recentChecks.length >= 2) {
    const latest = recentChecks[0];
    const previous = recentChecks[1];
    const hasIssueNow =
      latest.limping ||
      latest.stiffness ||
      latest.painSigns ||
      latest.difficultyStanding ||
      latest.difficultyStairsJumping;
    const hadNoIssueBefore =
      !previous.limping &&
      !previous.stiffness &&
      !previous.painSigns &&
      !previous.difficultyStanding &&
      !previous.difficultyStairsJumping;
    if (hasIssueNow && hadNoIssueBefore) {
      issues.suddenChange = true;
    }
  }

  return issues;
};

export const getMobilityWarningMessage = (issues) => {
  if (
    !issues.limping &&
    !issues.painSigns &&
    !issues.suddenChange &&
    !issues.difficultyMoving
  ) {
    return null;
  }

  return {
    message:
      "This change may be worth monitoring. Contact your vet if it continues, worsens, or your dog seems painful.",
    urgent: issues.painSigns || issues.limping,
  };
};

export const getUpcomingSocialWalks = () => {
  const now = new Date();
  return socialWalks
    .filter((walk) => new Date(walk.date) >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
};

export const getNextSocialWalk = () => {
  const upcoming = getUpcomingSocialWalks();
  return upcoming.length > 0 ? upcoming[0] : null;
};

// Add new walk log
export const addWalkLog = (walkData) => {
  const newLog = {
    id: `walk${Date.now()}`,
    petId: "sample-pet",
    timestamp: new Date().toISOString(),
    isActive: false,
    ...walkData,
  };
  walkLogs.unshift(newLog);
  return newLog;
};

// Add new mobility check
export const addMobilityCheck = (mobilityData) => {
  const newCheck = {
    id: `mobility${Date.now()}`,
    petId: "sample-pet",
    timestamp: new Date().toISOString(),
    ...mobilityData,
  };
  mobilityChecks.unshift(newCheck);
  return newCheck;
};

// Add new social walk
export const addSocialWalk = (socialWalkData) => {
  const newSocialWalk = {
    id: `social${Date.now()}`,
    petId: "sample-pet",
    attendees: [],
    ...socialWalkData,
  };
  socialWalks.unshift(newSocialWalk);
  return newSocialWalk;
};

// Get pace label
export const getPaceLabel = (pace) => {
  const labels = {
    relaxed: "Relaxed",
    normal: "Normal",
    active: "Active",
  };
  return labels[pace] || pace;
};

// Get pace emoji
export const getPaceEmoji = (pace) => {
  const emojis = {
    relaxed: "🐢",
    normal: "🐕",
    active: "🏃",
  };
  return emojis[pace] || "🐕";
};

// Get pace color
export const getPaceColor = (pace) => {
  const colors = {
    relaxed: "#9575CD", // purple
    normal: "#42A5F5", // blue
    active: "#FF6F61", // coral
  };
  return colors[pace] || "#42A5F5";
};

// Get energy level emoji
export const getEnergyEmoji = (energy) => {
  const emojis = {
    low: "😴",
    normal: "😊",
    high: "⚡",
  };
  return emojis[energy] || "😊";
};

// Get energy level color
export const getEnergyColor = (energy) => {
  const colors = {
    low: "#FFB74D", // orange
    normal: "#A7BFA3", // sage
    high: "#FF6F61", // coral
  };
  return colors[energy] || "#A7BFA3";
};

// Format duration
export const formatDuration = (minutes) => {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

// Format distance
export const formatDistance = (miles) => {
  return miles < 1
    ? `${(miles * 5280).toFixed(0)} ft`
    : `${miles.toFixed(1)} mi`;
};

// Check if mobility check has concerns
export const mobilityHasConcerns = (check) => {
  return (
    check.limping ||
    check.painSigns ||
    check.difficultyStanding ||
    check.difficultyStairsJumping ||
    check.stiffness
  );
};

// Get mobility issue summary
export const getMobilityIssueSummary = (check) => {
  const issues = [];
  if (check.limping) issues.push("limping");
  if (check.stiffness) issues.push("stiffness");
  if (check.difficultyStanding) issues.push("difficulty standing");
  if (check.difficultyStairsJumping)
    issues.push("difficulty with stairs/jumping");
  if (check.painSigns) issues.push("pain signs");
  return issues.join(", ");
};

// Format social walk date
export const formatSocialWalkDate = (dateString) => {
  const date = new Date(dateString);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  } else if (date.toDateString() === tomorrow.toDateString()) {
    return "Tomorrow";
  } else {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }
};

// Check if walk has potty events
export const walkHasPottyEvents = (walk) => {
  return walk.pottyEvents.poo > 0 || walk.pottyEvents.pee > 0;
};

// Format potty events
export const formatPottyEvents = (pottyEvents) => {
  const parts = [];
  if (pottyEvents.poo > 0) parts.push(`${pottyEvents.poo} 💩`);
  if (pottyEvents.pee > 0) parts.push(`${pottyEvents.pee} 💦`);
  return parts.join(", ");
};

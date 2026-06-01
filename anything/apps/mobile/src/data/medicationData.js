// Medication, Vaccines, and Preventive Care Data
// This module manages medication tracking, vaccines, and preventive treatments

// Current medications
let currentMedications = [
  {
    id: "med_001",
    name: "Carprofen",
    dose: "25mg",
    frequency: "Twice daily",
    startDate: new Date("2026-04-15").getTime(),
    endDate: null, // null = ongoing
    prescribedBy: "Dr. Sarah Mitchell",
    taken: {
      // timestamp: true/false
      [new Date("2026-05-06T08:30:00Z").getTime()]: true,
      [new Date("2026-05-06T20:00:00Z").getTime()]: false, // missed
    },
    sideEffects: "",
    notes: "Give with food",
    reminderEnabled: true,
    reminderTimes: ["08:00", "20:00"],
  },
  {
    id: "med_002",
    name: "Enalapril",
    dose: "5mg",
    frequency: "Once daily",
    startDate: new Date("2026-03-01").getTime(),
    endDate: null,
    prescribedBy: "Dr. Sarah Mitchell",
    taken: {
      [new Date("2026-05-06T09:00:00Z").getTime()]: true,
    },
    sideEffects: "",
    notes: "For heart health",
    reminderEnabled: true,
    reminderTimes: ["09:00"],
  },
];

// Past medications
let pastMedications = [
  {
    id: "med_003",
    name: "Amoxicillin",
    dose: "250mg",
    frequency: "Twice daily",
    startDate: new Date("2026-02-10").getTime(),
    endDate: new Date("2026-02-24").getTime(),
    prescribedBy: "Dr. Sarah Mitchell",
    taken: {},
    sideEffects: "None observed",
    notes: "Completed 14-day course for ear infection",
    reminderEnabled: false,
    reminderTimes: [],
  },
];

// Vaccines
let vaccines = [
  {
    id: "vax_001",
    name: "Rabies",
    dateGiven: new Date("2025-06-15").getTime(),
    expirationDate: new Date("2028-06-15").getTime(),
    dueDate: new Date("2028-06-15").getTime(),
    vetClinic: "Happy Paws Veterinary Clinic",
    documents: [],
    notes: "3-year vaccine",
    reminderEnabled: true,
  },
  {
    id: "vax_002",
    name: "DHPP (Distemper, Hepatitis, Parvovirus, Parainfluenza)",
    dateGiven: new Date("2025-06-15").getTime(),
    expirationDate: new Date("2028-06-15").getTime(),
    dueDate: new Date("2028-06-15").getTime(),
    vetClinic: "Happy Paws Veterinary Clinic",
    documents: [],
    notes: "Core vaccine, 3-year",
    reminderEnabled: true,
  },
  {
    id: "vax_003",
    name: "Bordetella",
    dateGiven: new Date("2026-01-10").getTime(),
    expirationDate: new Date("2027-01-10").getTime(),
    dueDate: new Date("2027-01-10").getTime(),
    vetClinic: "Happy Paws Veterinary Clinic",
    documents: [],
    notes: "Annual kennel cough vaccine",
    reminderEnabled: true,
  },
];

// Preventive treatments
let preventiveTreatments = [
  {
    id: "prev_001",
    productName: "Simparica Trio",
    type: "flea_tick_heartworm",
    lastGiven: new Date("2026-04-06").getTime(),
    nextDue: new Date("2026-05-06").getTime(),
    frequency: "Monthly",
    notes: "Chewable tablet, give with meal",
    reminderEnabled: true,
  },
  {
    id: "prev_002",
    productName: "Omega-3 Fish Oil",
    type: "supplement",
    lastGiven: new Date("2026-05-06T09:00:00Z").getTime(),
    nextDue: new Date("2026-05-07T09:00:00Z").getTime(),
    frequency: "Daily",
    notes: "For joint health",
    reminderEnabled: false,
  },
];

// Preventive treatment types
export const PREVENTIVE_TYPES = [
  { key: "flea", label: "Flea prevention", emoji: "🦟" },
  { key: "tick", label: "Tick prevention", emoji: "🕷️" },
  { key: "heartworm", label: "Heartworm prevention", emoji: "❤️" },
  { key: "flea_tick", label: "Flea & Tick", emoji: "🦟" },
  { key: "flea_tick_heartworm", label: "Flea, Tick & Heartworm", emoji: "💊" },
  { key: "dewormer", label: "Dewormer", emoji: "🪱" },
  { key: "supplement", label: "Supplement", emoji: "💊" },
  { key: "other", label: "Other preventive", emoji: "🏥" },
];

// Common medication frequencies
export const FREQUENCIES = [
  "Once daily",
  "Twice daily",
  "Three times daily",
  "Every 12 hours",
  "Every 8 hours",
  "As needed",
  "Weekly",
  "Monthly",
  "Other",
];

// Get all current medications
export function getCurrentMedications() {
  return [...currentMedications];
}

// Get all past medications
export function getPastMedications() {
  return [...pastMedications];
}

// Get all vaccines
export function getVaccines() {
  return [...vaccines].sort((a, b) => b.dateGiven - a.dateGiven);
}

// Get all preventive treatments
export function getPreventiveTreatments() {
  return [...preventiveTreatments];
}

// Get upcoming medication doses (today)
export function getUpcomingDoses() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTimestamp = today.getTime();

  const doses = [];

  currentMedications.forEach((med) => {
    if (med.reminderEnabled && med.reminderTimes) {
      med.reminderTimes.forEach((time) => {
        const [hours, minutes] = time.split(":");
        const doseDate = new Date(today);
        doseDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        const doseTimestamp = doseDate.getTime();

        const taken = med.taken[doseTimestamp] === true;

        doses.push({
          medicationId: med.id,
          medicationName: med.name,
          dose: med.dose,
          time,
          timestamp: doseTimestamp,
          taken,
          missed: med.taken[doseTimestamp] === false,
        });
      });
    }
  });

  return doses.sort((a, b) => a.timestamp - b.timestamp);
}

// Get missed doses from today
export function getMissedDoses() {
  const doses = getUpcomingDoses();
  const now = Date.now();
  return doses.filter((dose) => dose.timestamp < now && dose.missed);
}

// Get vaccines due soon (within 60 days)
export function getVaccinesDueSoon() {
  const now = Date.now();
  const sixtyDaysFromNow = now + 60 * 24 * 60 * 60 * 1000;

  return vaccines.filter((vax) => {
    return vax.dueDate >= now && vax.dueDate <= sixtyDaysFromNow;
  });
}

// Get overdue vaccines
export function getOverdueVaccines() {
  const now = Date.now();
  return vaccines.filter((vax) => vax.dueDate < now);
}

// Get preventives due soon (within 7 days)
export function getPreventivesDueSoon() {
  const now = Date.now();
  const sevenDaysFromNow = now + 7 * 24 * 60 * 60 * 1000;

  return preventiveTreatments.filter((prev) => {
    return prev.nextDue >= now && prev.nextDue <= sevenDaysFromNow;
  });
}

// Get overdue preventives
export function getOverduePreventives() {
  const now = Date.now();
  return preventiveTreatments.filter((prev) => prev.nextDue < now);
}

// Mark dose as taken
export function markDoseTaken(medicationId, timestamp, taken = true) {
  const med = currentMedications.find((m) => m.id === medicationId);
  if (med) {
    med.taken[timestamp] = taken;
  }
}

// Mark dose as missed
export function markDoseMissed(medicationId, timestamp) {
  markDoseTaken(medicationId, timestamp, false);
}

// Add new medication
export function addMedication(medicationData) {
  const newMed = {
    id: `med_${Date.now()}`,
    name: medicationData.name,
    dose: medicationData.dose || "",
    frequency: medicationData.frequency || "",
    startDate: medicationData.startDate || Date.now(),
    endDate: medicationData.endDate || null,
    prescribedBy: medicationData.prescribedBy || "",
    taken: {},
    sideEffects: medicationData.sideEffects || "",
    notes: medicationData.notes || "",
    reminderEnabled: medicationData.reminderEnabled || false,
    reminderTimes: medicationData.reminderTimes || [],
  };

  currentMedications.unshift(newMed);
  return newMed;
}

// Update medication
export function updateMedication(medicationId, updates) {
  const index = currentMedications.findIndex((m) => m.id === medicationId);
  if (index !== -1) {
    currentMedications[index] = { ...currentMedications[index], ...updates };
    return currentMedications[index];
  }
  return null;
}

// Mark medication as completed (move to past)
export function completeMedication(medicationId) {
  const index = currentMedications.findIndex((m) => m.id === medicationId);
  if (index !== -1) {
    const med = currentMedications.splice(index, 1)[0];
    med.endDate = Date.now();
    pastMedications.unshift(med);
    return med;
  }
  return null;
}

// Add new vaccine
export function addVaccine(vaccineData) {
  const newVaccine = {
    id: `vax_${Date.now()}`,
    name: vaccineData.name,
    dateGiven: vaccineData.dateGiven || Date.now(),
    expirationDate: vaccineData.expirationDate || null,
    dueDate: vaccineData.dueDate || null,
    vetClinic: vaccineData.vetClinic || "",
    documents: vaccineData.documents || [],
    notes: vaccineData.notes || "",
    reminderEnabled: vaccineData.reminderEnabled || false,
  };

  vaccines.unshift(newVaccine);
  return newVaccine;
}

// Update vaccine
export function updateVaccine(vaccineId, updates) {
  const index = vaccines.findIndex((v) => v.id === vaccineId);
  if (index !== -1) {
    vaccines[index] = { ...vaccines[index], ...updates };
    return vaccines[index];
  }
  return null;
}

// Add new preventive treatment
export function addPreventiveTreatment(preventiveData) {
  const newPreventive = {
    id: `prev_${Date.now()}`,
    productName: preventiveData.productName,
    type: preventiveData.type || "other",
    lastGiven: preventiveData.lastGiven || null,
    nextDue: preventiveData.nextDue || null,
    frequency: preventiveData.frequency || "",
    notes: preventiveData.notes || "",
    reminderEnabled: preventiveData.reminderEnabled || false,
  };

  preventiveTreatments.unshift(newPreventive);
  return newPreventive;
}

// Update preventive treatment
export function updatePreventiveTreatment(preventiveId, updates) {
  const index = preventiveTreatments.findIndex((p) => p.id === preventiveId);
  if (index !== -1) {
    preventiveTreatments[index] = {
      ...preventiveTreatments[index],
      ...updates,
    };
    return preventiveTreatments[index];
  }
  return null;
}

// Get preventive type label
export function getPreventiveTypeLabel(typeKey) {
  const type = PREVENTIVE_TYPES.find((t) => t.key === typeKey);
  return type ? type.label : typeKey;
}

// Get preventive type emoji
export function getPreventiveTypeEmoji(typeKey) {
  const type = PREVENTIVE_TYPES.find((t) => t.key === typeKey);
  return type ? type.emoji : "💊";
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

// Calculate days until
export function getDaysUntil(timestamp) {
  if (!timestamp) return null;
  const now = Date.now();
  const diff = timestamp - now;
  const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
  return days;
}

// Get status badge for vaccines
export function getVaccineStatus(vaccine) {
  const now = Date.now();
  if (vaccine.dueDate < now) {
    return { status: "overdue", label: "Overdue", color: "#E57373" };
  }
  const daysUntil = getDaysUntil(vaccine.dueDate);
  if (daysUntil <= 30) {
    return { status: "due_soon", label: "Due soon", color: "#FFB74D" };
  }
  return { status: "current", label: "Current", color: "#81C784" };
}

// Get status badge for preventives
export function getPreventiveStatus(preventive) {
  const now = Date.now();
  if (preventive.nextDue < now) {
    return { status: "overdue", label: "Overdue", color: "#E57373" };
  }
  const daysUntil = getDaysUntil(preventive.nextDue);
  if (daysUntil <= 3) {
    return { status: "due_soon", label: "Due soon", color: "#FFB74D" };
  }
  return { status: "current", label: "On schedule", color: "#81C784" };
}

// Check if any reminders are active
export function hasActiveReminders() {
  const hasMedReminders = currentMedications.some((m) => m.reminderEnabled);
  const hasVaxReminders = vaccines.some((v) => v.reminderEnabled);
  const hasPrevReminders = preventiveTreatments.some((p) => p.reminderEnabled);
  return hasMedReminders || hasVaxReminders || hasPrevReminders;
}

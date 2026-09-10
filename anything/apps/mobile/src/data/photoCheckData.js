// Photo Check constants (schedules, labels). The seeded sample history that used to live
// here was removed (AUDIT_2026-09 A-13): PhotoHistory now reads the pet's real photo
// checks from the API.

export const PHOTO_CHECK_SCHEDULES = {
  paws: {
    frequency: "weekly",
    nextDueDate: "2026-05-06", // Today
    lastUploadDate: "2026-04-29",
  },
  eyes: {
    frequency: "weekly",
    nextDueDate: "2026-05-08",
    lastUploadDate: "2026-05-01",
  },
  ears: {
    frequency: "every_2_weeks",
    nextDueDate: "2026-05-12",
    lastUploadDate: "2026-04-28",
  },
  teeth: {
    frequency: "monthly",
    nextDueDate: "2026-05-28",
    lastUploadDate: "2026-04-28",
  },
  skin_fur: {
    frequency: "monthly",
    nextDueDate: "2026-06-01",
    lastUploadDate: "2026-05-01",
  },
  face: {
    frequency: "monthly",
    nextDueDate: "2026-05-30",
    lastUploadDate: "2026-04-30",
  },
  full_body: {
    frequency: "monthly",
    nextDueDate: "2026-06-05",
    lastUploadDate: "2026-05-05",
  },
  other: {
    frequency: "off",
    nextDueDate: null,
    lastUploadDate: null,
  },
};

export const FREQUENCY_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "weekly", label: "Weekly" },
  { value: "every_2_weeks", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
];

export const BODY_AREA_LABELS = {
  paws: "Paws",
  ears: "Ears",
  eyes: "Eyes",
  teeth: "Teeth",
  skin_fur: "Skin / Fur",
  face: "Face",
  full_body: "Full body",
  other: "Other",
};

// Helper function to get due photo checks
export function getDuePhotoChecks() {
  const today = new Date("2026-05-06"); // Mock today's date
  const dueChecks = [];

  Object.entries(PHOTO_CHECK_SCHEDULES).forEach(([area, schedule]) => {
    if (schedule.frequency !== "off" && schedule.nextDueDate) {
      const dueDate = new Date(schedule.nextDueDate);
      if (dueDate <= today) {
        dueChecks.push({
          area,
          ...schedule,
        });
      }
    }
  });

  return dueChecks;
}

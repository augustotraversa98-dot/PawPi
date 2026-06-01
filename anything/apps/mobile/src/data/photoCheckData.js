// Mock data for Photo Check system

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

export const PHOTO_CHECK_HISTORY = [
  {
    id: "pc001",
    petId: "phoebe",
    bodyArea: "paws",
    imageUrl:
      "https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=400",
    notes: "Looking good, no redness",
    createdAt: "2026-04-29T08:30:00Z",
    includedInVetSummary: false,
  },
  {
    id: "pc002",
    petId: "phoebe",
    bodyArea: "eyes",
    imageUrl:
      "https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=400",
    notes: "Clear and bright",
    createdAt: "2026-05-01T09:15:00Z",
    includedInVetSummary: false,
  },
  {
    id: "pc003",
    petId: "phoebe",
    bodyArea: "teeth",
    imageUrl: "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=400",
    notes: "Some tartar buildup on back molars",
    createdAt: "2026-04-28T10:00:00Z",
    includedInVetSummary: true,
  },
  {
    id: "pc004",
    petId: "phoebe",
    bodyArea: "ears",
    imageUrl:
      "https://images.unsplash.com/photo-1529472119196-cb724127a98e?w=400",
    notes: "",
    createdAt: "2026-04-28T11:20:00Z",
    includedInVetSummary: false,
  },
  {
    id: "pc005",
    petId: "phoebe",
    bodyArea: "skin_fur",
    imageUrl:
      "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400",
    notes: "Coat is shiny and healthy",
    createdAt: "2026-05-01T14:30:00Z",
    includedInVetSummary: false,
  },
  {
    id: "pc006",
    petId: "phoebe",
    bodyArea: "full_body",
    imageUrl:
      "https://images.unsplash.com/photo-1537151608828-ea2b11777ee8?w=400",
    notes: "Maintaining good weight",
    createdAt: "2026-05-05T16:00:00Z",
    includedInVetSummary: false,
  },
];

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

// Helper function to get photo history by body area
export function getPhotoHistoryByArea(area) {
  return PHOTO_CHECK_HISTORY.filter((photo) => photo.bodyArea === area).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  );
}

// Helper function to get all photo history grouped by area
export function getPhotoHistoryGrouped() {
  const grouped = {};
  PHOTO_CHECK_HISTORY.forEach((photo) => {
    if (!grouped[photo.bodyArea]) {
      grouped[photo.bodyArea] = [];
    }
    grouped[photo.bodyArea].push(photo);
  });

  // Sort each group by date (newest first)
  Object.keys(grouped).forEach((area) => {
    grouped[area].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  });

  return grouped;
}

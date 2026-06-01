import { ROUTINE_FREQUENCY } from "@/data/routinesData";

export const DEFAULT_WALK = {
  name: "Walk",
  time: "12:00",
  frequency: ROUTINE_FREQUENCY.DAILY,
  days: [],
  durationMinutes: 30,
  pace: "normal",
  reminderEnabled: true,
  timeSensitive: true,
  socialWalkEnabled: false,
  visibility: "friends_only",
  maxPets: 4,
  meetingArea: "",
  meetingLocationDetails: "",
  approvalRequired: true,
  notesForGuests: "",
  notes: "",
};

export const DEFAULT_WALKS = {
  1: [
    {
      ...DEFAULT_WALK,
      name: "Walk",
      time: "12:00",
    },
  ],
  2: [
    {
      ...DEFAULT_WALK,
      name: "Morning walk",
      time: "07:30",
    },
    {
      ...DEFAULT_WALK,
      name: "Evening walk",
      time: "18:30",
    },
  ],
};

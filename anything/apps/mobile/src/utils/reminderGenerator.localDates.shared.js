// Shared body for the local-calendar-day regression (AUDIT_2026-09 A-12). Run under BOTH
// jest configs: Europe/Rome (main suite — must not change behaviour there) and
// America/Argentina/Buenos_Aires (tz-negative — where `new Date("YYYY-MM-DD")` shifted a day).
import { generateRemindersFromRoutine } from "./reminderGenerator";
import { ROUTINE_TYPES } from "../data/routinesData";

export function defineLocalDateTests() {
  const NOW = new Date(2026, 5, 10, 8, 0, 0); // Wed 2026-06-10 08:00 local

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  const base = (overrides) => ({
    id: "100",
    petId: "42",
    isActive: true,
    notificationEnabled: true,
    times: [],
    days: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
  const localDay = (iso) => {
    const d = new Date(iso);
    return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()];
  };

  test("a medication course starting TOMORROW does not emit a dose today, and keeps its last day", () => {
    const reminders = generateRemindersFromRoutine(
      base({
        type: ROUTINE_TYPES.MEDICATION,
        times: ["08:00"],
        startDate: "2026-06-11",
        endDate: "2026-06-15",
      }),
      14,
    );

    expect(reminders.map((r) => localDay(r.scheduledAt))).toEqual([
      [2026, 6, 11, 8],
      [2026, 6, 12, 8],
      [2026, 6, 13, 8],
      [2026, 6, 14, 8],
      [2026, 6, 15, 8],
    ]);
  });

  test("a vet appointment fires on the appointment's local day, with a stable id", () => {
    const reminders = generateRemindersFromRoutine(
      base({
        type: ROUTINE_TYPES.VET_APPOINTMENT,
        date: "2026-06-12",
        times: ["10:30"],
        appointmentTitle: "Vaccines",
      }),
      14,
    );

    expect(reminders).toHaveLength(1);
    expect(localDay(reminders[0].scheduledAt)).toEqual([2026, 6, 12, 10]);
    expect(reminders[0].id).toBe("reminder_100_2026-06-12");
  });

  test("a medical-care dose item starting tomorrow is not dosed today and includes its end day", () => {
    const reminders = generateRemindersFromRoutine(
      base({
        type: ROUTINE_TYPES.MEDICAL_CARE,
        medicalCareItems: [
          {
            id: "med1",
            type: "medication",
            name: "Rimadyl",
            times: ["09:00"],
            startDate: "2026-06-11",
            endDate: "2026-06-12",
          },
        ],
      }),
      14,
    );

    expect(reminders.map((r) => localDay(r.scheduledAt))).toEqual([
      [2026, 6, 11, 9],
      [2026, 6, 12, 9],
    ]);
  });
}

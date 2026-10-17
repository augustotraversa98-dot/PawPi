import { appointmentToReminder } from "./useVetAppointmentReminders";

jest.mock("./usePetProfile", () => ({ useCurrentPet: () => ({ data: null }) }));

// Regression (flow audit F1-02): Postgres returns `appointment_time` as "HH:MM:SS" and the date as
// a date/ISO string. The old `${date}T${time}:00` string was an Invalid Date, which threw in
// toISOString() and hid EVERY vet appointment from Today.
describe("appointmentToReminder", () => {
  const base = { id: 7, pet_id: 1, owner_user_id: 2, title: "Vaccines", status: "scheduled" };

  test.each([
    ["2026-10-20", "09:30"],
    ["2026-10-20", "09:30:00"],
    ["2026-10-20T00:00:00.000Z", "09:30:00"],
  ])("reads date %s + time %s as LOCAL 09:30 on 20 Oct", (appointment_date, appointment_time) => {
    const r = appointmentToReminder({ ...base, appointment_date, appointment_time });
    const at = new Date(r.appointmentDateTime);
    expect(at.getFullYear()).toBe(2026);
    expect(at.getMonth()).toBe(9);
    expect(at.getDate()).toBe(20);
    expect(at.getHours()).toBe(9);
    expect(at.getMinutes()).toBe(30);
    expect(r.id).toBe("vet_apt_7");
  });

  test("honours reminder_timing offsets", () => {
    const r = appointmentToReminder({
      ...base,
      appointment_date: "2026-10-20",
      appointment_time: "09:30:00",
      reminder_timing: "1_day_before",
    });
    expect(new Date(r.appointmentDateTime).getTime() - new Date(r.nextTriggerAt).getTime()).toBe(24 * 3600 * 1000);
  });

  test("a row with an unreadable date is skipped (null), never throws", () => {
    expect(appointmentToReminder({ ...base, appointment_date: "garbage", appointment_time: "x" })).toBeNull();
    expect(appointmentToReminder({ ...base, appointment_date: undefined, appointment_time: undefined })).toBeNull();
  });
});

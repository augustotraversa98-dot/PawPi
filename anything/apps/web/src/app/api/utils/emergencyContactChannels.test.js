import { describe, it, expect } from "vitest";
import { emergencyContactChannels } from "./emergencyContactChannels";

const NONE = {
  contact_phone_enabled: null,
  contact_email_enabled: null,
  contact_message_enabled: null,
  contact_phone: null,
  contact_email: null,
};
const legacy = (contact_mode, contact_value) => ({ ...NONE, contact_mode, contact_value });

describe("emergencyContactChannels", () => {
  it.each([[undefined], [null], [{ contact_mode: "phone", contact_value: "11 5555" }]])(
    "reports the switches as unavailable for %o",
    (row) => {
      expect(emergencyContactChannels(row)).toEqual(NONE);
    },
  );

  it.each([
    ["relay", null, [false, false, true, null, null]],
    ["none", "11 5555", [false, false, false, "11 5555", null]],
    ["phone", "11 5555", [true, false, true, "11 5555", null]],
    ["email", "a@example.test", [false, true, true, null, "a@example.test"]],
    // A value of the other kind stays in the field of the chosen channel, where it is flagged.
    ["phone", "a@example.test", [true, false, true, "a@example.test", "a@example.test"]],
    ["email", "11 5555", [false, true, true, "11 5555", "11 5555"]],
  ])("describes a card saved as %s / %s", (mode, value, [phoneOn, emailOn, messageOn, phone, email]) => {
    expect(emergencyContactChannels(legacy(mode, value))).toEqual({
      contact_phone_enabled: phoneOn,
      contact_email_enabled: emailOn,
      contact_message_enabled: messageOn,
      contact_phone: phone,
      contact_email: email,
    });
  });

  it("returns the stored choice of a card saved with the switches, and only those fields", () => {
    const chosen = {
      contact_phone_enabled: false,
      contact_email_enabled: true,
      contact_message_enabled: false,
      contact_phone: "",
      contact_email: "a@example.test",
    };
    expect(emergencyContactChannels({ ...chosen, contact_mode: "email", tag_token: "T" })).toEqual(chosen);
  });
});

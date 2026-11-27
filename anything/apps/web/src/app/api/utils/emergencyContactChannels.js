// What the owner's emergency card says about showing a finder a phone number, an email address, both or neither
// (migration 0152, docs/emergency-finder.md). The public pages and the finder message are decided in the database;
// this only describes the choice to its owner.

export const CHANNEL_FLAGS = [
  "contact_phone_enabled",
  "contact_email_enabled",
  "contact_message_enabled",
];
export const CHANNEL_VALUES = ["contact_phone", "contact_email"];
const CHANNEL_FIELDS = [...CHANNEL_FLAGS, ...CHANNEL_VALUES];

const unavailable = () => Object.fromEntries(CHANNEL_FIELDS.map((field) => [field, null]));

/**
 * The five channel fields for a whole pet_emergency_cards row (as `to_jsonb` returns it).
 * All null when the database has no 0152 columns: the app then offers the single choice only.
 * A card never saved with the switches is described from contact_mode / contact_value, by the same rule the 0152
 * trigger applies on its first save (the integration test holds the two together).
 */
export function emergencyContactChannels(row) {
  if (!row || !("contact_phone_enabled" in row)) return unavailable();
  if (row.contact_phone_enabled !== null) {
    return Object.fromEntries(CHANNEL_FIELDS.map((field) => [field, row[field]]));
  }
  const { contact_mode: mode, contact_value: value } = row;
  const looksLikeEmail = value == null ? null : value.includes("@");
  return {
    contact_phone_enabled: mode === "phone",
    contact_email_enabled: mode === "email",
    contact_message_enabled: mode !== "none",
    contact_phone: mode === "phone" || looksLikeEmail === false ? value : null,
    contact_email: mode === "email" || looksLikeEmail === true ? value : null,
  };
}

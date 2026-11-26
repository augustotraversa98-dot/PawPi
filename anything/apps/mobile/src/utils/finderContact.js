// What a finder left with an "emergency_contact" notification (server: notifications.finder_contact, 0146) and the
// safe tel: / mailto: links for it. The values were typed by an anonymous person, so they are re-checked here before
// anything is handed to the phone.

// No spaces and none of ? & # % , ; : which could add recipients or headers to a mailto: link.
const EMAIL = /^[^\s@?&#%,;:<>()[\]\\"\/]+@[^\s@?&#%,;:<>()[\]\\"\/]+\.[^\s@?&#%,;:<>()[\]\\"\/]{2,}$/;

/** {petName, name, phone, email, message} (null for each missing one), or null for a notification without it. */
export function parseFinderContact(raw) {
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const text = (key) =>
    typeof data[key] === "string" && data[key].trim() ? data[key].trim() : null;
  return {
    petName: text("pet_name"),
    name: text("name"),
    phone: text("phone"),
    email: text("email"),
    message: text("message"),
  };
}

/** tel: link, or null when there are not enough digits to dial. */
export function telUrl(value) {
  const v = String(value ?? "").trim();
  const digits = v.replace(/\D/g, "");
  if (digits.length < 3) return null;
  return `tel:${v.startsWith("+") ? "+" : ""}${digits}`;
}

/** mailto: link, or null when it is not a plain address. */
export function mailUrl(value) {
  const v = String(value ?? "").trim();
  return EMAIL.test(v) ? `mailto:${v}` : null;
}

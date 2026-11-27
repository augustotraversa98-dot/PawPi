// The words shown for a stored business type or capability ("vet", "walker", "pet_friendly"…),
// from the discover.cap.* catalog. The stored values are English ids and are never translated
// in the data. A value the catalog does not know is shown as stored, tidied up. "" for none.
export function providerTypeLabel(t, type) {
  const value = String(type ?? "").trim();
  if (!value) return "";
  const key = `discover.cap.${value}`;
  const label = t(key);
  if (typeof label === "string" && label && label !== key) return label;
  const words = value.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

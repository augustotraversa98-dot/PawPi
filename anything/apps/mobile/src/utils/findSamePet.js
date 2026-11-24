// A dog with this name is already in the person's list — owned OR shared with them. The usual way a partner ends up with the SAME dog
// twice is adding it again by hand; the add-dog form asks before creating when this finds one. Case/whitespace-insensitive.
export function findSamePet(pets, name) {
  const wanted = String(name ?? "").trim().toLowerCase();
  if (!wanted || !Array.isArray(pets)) return null;
  return pets.find((p) => String(p?.name ?? "").trim().toLowerCase() === wanted) ?? null;
}

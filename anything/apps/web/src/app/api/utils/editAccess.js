// "Can add" on a share (migration 0158, docs/vet-sharing-design.md "View and add"). View only unless the owner says
// otherwise. The database enforces what may be written; these helpers read and check the owner's choice.

import sql from "./sql";

// The parts a vet can ever be allowed to add to.
export const EDITABLE_SECTIONS = ["vet_notes", "vaccines", "files", "lab_results"];

let supported = false;

/**
 * Whether the database can both store the permission and let a vet use it (0158 and 0160). Asked until it can, then
 * remembered, so an owner is never offered a permission that would do nothing.
 */
export async function editAccessSupported() {
  if (supported) return true;
  const rows = await sql`
    SELECT to_regprocedure('app_record_link_add_record(text,text,jsonb)') IS NOT NULL AS ok
  `;
  supported = rows?.[0]?.ok === true;
  return supported;
}

/** Forget the answer (tests). */
export function resetEditAccessSupport() {
  supported = false;
}

export const editAccessUnavailable = () =>
  Response.json(
    { error: "Letting a vet add to the record is not available yet", code: "edit_access_unavailable" },
    { status: 409 },
  );

/**
 * The owner's "can add" choice from a request body, in the server's order. `sections` are the parts being shared.
 * An absent value is view only. `notesWithoutView`: a record link may allow adding notes without showing them.
 *
 * @returns {{ value: string[] } | { error: string }}
 */
export function parseEditSections(value, sections, { notesWithoutView = false } = {}) {
  if (value === undefined) return { value: [] };
  if (
    !Array.isArray(value) ||
    new Set(value).size !== value.length ||
    !value.every((s) => EDITABLE_SECTIONS.includes(s))
  ) {
    return { error: `editSections must be a list of different values among ${EDITABLE_SECTIONS.join(", ")}` };
  }
  const unshared = value.filter(
    (s) => !sections.includes(s) && !(notesWithoutView && s === "vet_notes"),
  );
  if (unshared.length > 0) {
    return { error: "editSections can only name shared sections" };
  }
  return { value: EDITABLE_SECTIONS.filter((s) => value.includes(s)) };
}

export const sameSections = (a, b) =>
  (a ?? []).length === (b ?? []).length && (a ?? []).every((s) => b.includes(s));

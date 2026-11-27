// Who a vet note is from, for notes added through a record link (never the owner).
import { linkNoteAuthor, vetNoteAuthor } from "./sharingLabels";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";

const t = (locale) => (key) => key.split(".").reduce((node, part) => node[part], locale);

test("a link note shows the signed-in name, the outside label, or former member, in the reader's language", () => {
  const note = (name) => ({ via_record_link: true, external_author_name: name, vet_name: "stored label" });
  expect(vetNoteAuthor(t(en), note(null))).toBe("Anonymous");
  expect(vetNoteAuthor(t(es), note(null))).toBe("Cambios de alguien externo");
  expect(linkNoteAuthor(t(es), note("Dr. Gómez"))).toBe("Dr. Gómez");
  expect(linkNoteAuthor(t(es), note("Former member"))).toBe("Ex integrante");
});

test("any other note keeps its own author, and an owner's note has none", () => {
  expect(vetNoteAuthor(t(en), { vet_name: "North Clinic" })).toBe("North Clinic");
  expect(vetNoteAuthor(t(en), { vet_name: null })).toBeNull();
});

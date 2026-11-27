// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BREED_NAMES_ES, breedName } from "./breeds";

const appSpanish = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../../mobile/src/i18n/locales/es.json", import.meta.url)),
    "utf8",
  ),
);

describe("breed names on the pet pages", () => {
  it("are the names the app uses", () => {
    expect(BREED_NAMES_ES).toEqual({
      ...appSpanish.trainingUi.breeds,
      "Mixed Breed": appSpanish.breedPicker.mixed,
    });
  });

  it("translate for a Spanish viewer only", () => {
    expect(breedName("Poodle", "es")).toBe("Caniche");
    expect(breedName("Mixed Breed", "es")).toBe("Mestizo");
    expect(breedName("Poodle", "en")).toBe("Poodle");
  });

  it.each(["Beagle", "Perro de la cuadra", "constructor", "", null, undefined])(
    "show %j as stored",
    (breed) => {
      expect(breedName(breed, "es")).toBe(breed);
    },
  );
});

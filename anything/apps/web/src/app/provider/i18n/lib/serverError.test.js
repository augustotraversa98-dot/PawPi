import { describe, it, expect } from "vitest";
import { serverErrorMessage } from "./serverError";
import serverErrors from "../serverErrors";

const FALLBACK = "No pudimos guardar.";

describe("serverErrorMessage", () => {
  it("shows the message as sent in English, else the fallback", () => {
    expect(serverErrorMessage(new Error("Unauthorized"), "en", "x")).toBe("Unauthorized");
    expect(serverErrorMessage(null, "en", "Please try again.")).toBe("Please try again.");
  });

  it("translates the listed messages in Spanish", () => {
    expect(serverErrorMessage(new Error("Not authorized for this provider"), "es", FALLBACK)).toBe(
      serverErrors.es.notAuthorized,
    );
    expect(serverErrorMessage("Upload failed: File too large.", "es", FALLBACK)).toBe(serverErrors.es.uploadTooLarge);
    expect(serverErrorMessage(new TypeError("Failed to fetch"), "es", FALLBACK)).toBe(serverErrors.es.network);
  });

  it("carries a value inside the message across", () => {
    expect(serverErrorMessage(new Error("Invalid capability: x, y"), "es", FALLBACK)).toBe(
      "Una de las opciones elegidas no es válida (x, y).",
    );
  });

  it("uses the screen's own text for a generic failure", () => {
    expect(serverErrorMessage(new Error("Failed to load analytics"), "es", FALLBACK)).toBe(FALLBACK);
    expect(serverErrorMessage(new Error("Request failed (502)"), "es", FALLBACK)).toBe(FALLBACK);
    expect(serverErrorMessage(undefined, "es", FALLBACK)).toBe(FALLBACK);
  });

  it("reads an area's own messages first", () => {
    const area = {
      en: { server: { confirmed: "Only a requested booking can be confirmed" } },
      es: { server: { confirmed: "Solo se puede confirmar una reserva solicitada" } },
    };
    expect(serverErrorMessage(new Error("Only a requested booking can be confirmed"), "es", FALLBACK, area)).toBe(
      "Solo se puede confirmar una reserva solicitada",
    );
  });

  it("shows a message nobody listed as sent", () => {
    expect(serverErrorMessage(new Error("Something specific"), "es", FALLBACK)).toBe("Something specific");
  });
});

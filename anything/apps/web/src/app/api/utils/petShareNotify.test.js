import { describe, expect, it, vi } from "vitest";

vi.mock("./sql", () => ({ default: vi.fn(async () => []) }));
vi.mock("./requestContext", () => ({ withSavepoint: async (fn) => fn() }));
vi.mock("./notify", () => ({ safeNotifyIsolated: vi.fn(async () => 42) }));
vi.mock("./ownerDisplay", () => ({ publicOwnerName: (row) => row?.full_name || null }));

import { PET_SHARE_TYPES, petShareBody, notifyPetShare } from "./petShareNotify";
import { safeNotifyIsolated } from "./notify";
import { accessVersion } from "./petShareAccess";

describe("petShareBody", () => {
  it("renders every type in es-AR (default) and en, naming the pet, never an e-mail / username / JSON", () => {
    for (const type of PET_SHARE_TYPES) {
      for (const locale of ["es", "en", undefined]) {
        const body = petShareBody(type, locale, { actorName: "Olivia", petName: "Rex" });
        expect(body, `${type}/${locale}`).toMatch(/Rex/);
        expect(body).not.toMatch(/[@{}]/);
      }
    }
  });

  it("uses voseo in Spanish and plain English otherwise", () => {
    expect(petShareBody("pet_share_invite", "es", { actorName: "Olivia", petName: "Rex" })).toBe("Olivia te invitó a ayudar a cuidar a Rex.");
    expect(petShareBody("pet_share_revoked", "es", { petName: "Rex" })).toBe("Ya no tenés acceso a Rex.");
    expect(petShareBody("pet_share_invite", "en", { actorName: "Olivia", petName: "Rex" })).toBe("Olivia invited you to help care for Rex.");
  });

  it("falls back to a neutral word when the actor or pet name is missing, and returns null for an unknown type", () => {
    expect(petShareBody("pet_share_left", "en", {})).toBe("Someone stopped helping care for a dog.");
    expect(petShareBody("pet_share_left", "es", { actorName: "  " })).toBe("Alguien dejó de ayudar a cuidar a un perro.");
    expect(petShareBody("paw", "en", {})).toBeNull();
  });
});

describe("notifyPetShare", () => {
  it("never notifies a user about their own action, an unknown type or a missing recipient", async () => {
    safeNotifyIsolated.mockClear();
    expect(await notifyPetShare({ type: "pet_share_left", recipient: 5, actor: 5, petId: 1, petName: "Rex" })).toBeNull();
    expect(await notifyPetShare({ type: "paw", recipient: 5, actor: 6, petId: 1 })).toBeNull();
    expect(await notifyPetShare({ type: "pet_share_invite", recipient: null, actor: 6, petId: 1 })).toBeNull();
    expect(safeNotifyIsolated).not.toHaveBeenCalled();
  });

  it("sends one notification to the recipient with the pet id as subject_ref", async () => {
    safeNotifyIsolated.mockClear();
    const id = await notifyPetShare({ type: "pet_share_invite", recipient: 7, actor: 6, petId: 12, petName: "Rex", actorName: "Olivia" });
    expect(id).toBe(42);
    expect(safeNotifyIsolated).toHaveBeenCalledTimes(1);
    expect(safeNotifyIsolated.mock.calls[0][0]).toMatchObject({ recipient: 7, actor: 6, type: "pet_share_invite", subjectRef: "12" });
  });

  it("never throws, even if the notifier does", async () => {
    safeNotifyIsolated.mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await notifyPetShare({ type: "pet_share_invite", recipient: 7, actor: 6, petId: 1 })).toBeNull();
  });
});

describe("accessVersion", () => {
  const g = (id, role, expires_at = null) => ({ id, role, expires_at });
  it("is stable regardless of order, and changes when a grant is added, removed, re-roled or its expiry moves", () => {
    const base = accessVersion([g(1, "family"), g(2, "caregiver")]);
    expect(accessVersion([g(2, "caregiver"), g(1, "family")])).toBe(base);
    expect(accessVersion([g(1, "family")])).not.toBe(base);
    expect(accessVersion([g(1, "caregiver"), g(2, "caregiver")])).not.toBe(base);
    expect(accessVersion([g(1, "family", "2999-01-01T00:00:00Z"), g(2, "caregiver")])).not.toBe(base);
    expect(accessVersion([])).toBe(accessVersion(undefined));
    expect(base).toMatch(/^[0-9a-f]{12}$/);
  });
});

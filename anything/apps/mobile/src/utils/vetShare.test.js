import { bookedVetsForPet, shareBlockReason, isGrantExpired } from "./vetShare";

const booking = (over) => ({
  pet_id: 7,
  provider_id: 1,
  provider_name: "Happy Paws",
  capability: "vet",
  ...over,
});

describe("bookedVetsForPet", () => {
  test("only vet bookings of this pet with a provider, one row per vet", () => {
    const vets = bookedVetsForPet(
      {
        upcoming: [
          booking(),
          booking({ provider_id: 2, provider_name: "Groomer", capability: "groomer" }),
          booking({ provider_id: 3, provider_name: "Other dog's vet", pet_id: 8 }),
          booking({ provider_id: null }),
        ],
        past: [booking(), booking({ provider_id: 4, provider_name: "Remote vet", capability: "telehealth" })],
      },
      7,
    );
    expect(vets).toEqual([
      { providerId: 1, name: "Happy Paws" },
      { providerId: 4, name: "Remote vet" },
    ]);
  });

  test("no data → no vets", () => {
    expect(bookedVetsForPet(undefined, 7)).toEqual([]);
  });
});

describe("shareBlockReason", () => {
  const grant = (over) => ({ provider_id: 1, status: "active", scopes: ["medical_read"], ...over });

  test("free to pick with no grant, or only revoked ones, or another vet's", () => {
    expect(shareBlockReason([], 1)).toBeNull();
    expect(shareBlockReason([grant({ status: "revoked" })], 1)).toBeNull();
    expect(shareBlockReason([grant({ provider_id: 2 })], 1)).toBeNull();
  });

  test("already shared, pending, or another active grant", () => {
    expect(shareBlockReason([grant()], 1)).toBe("shared");
    expect(shareBlockReason([grant({ status: "pending" })], 1)).toBe("pending");
    expect(shareBlockReason([grant({ scopes: ["health_logs_write"] })], 1)).toBe("other");
    expect(shareBlockReason([grant({ expires_at: "2000-01-01" })], 1)).toBe("other");
  });

  test("expiry", () => {
    expect(isGrantExpired({ expires_at: "2000-01-01" })).toBe(true);
    expect(isGrantExpired({ expires_at: "2999-01-01" })).toBe(false);
    expect(isGrantExpired({})).toBe(false);
  });
});

import {
  hasBookingForPet,
  visibleInvites,
  SHARE_EXPIRIES,
  SHARE_SECTIONS,
  bookedVetsForPet,
  expiryDate,
  grantAccessLines,
  grantMatchesChoice,
  isGrantActive,
  isGrantEnded,
  sectionsSupported,
} from "./vetShare";

const booking = (over) => ({
  pet_id: 7,
  provider_id: 1,
  provider_name: "Happy Paws",
  capability: "vet",
  ...over,
});

test("the section and expiry keys are the server's", () => {
  expect(SHARE_SECTIONS).toEqual([
    "profile",
    "emergency_contact",
    "insurance",
    "vet_notes",
    "vaccines",
    "files",
    "photos",
    "lab_results",
  ]);
  expect(SHARE_EXPIRIES).toEqual(["7d", "30d", "1y", "until_revoked"]);
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

describe("effective state", () => {
  const past = "2000-01-01T00:00:00Z";
  const future = "2999-01-01T00:00:00Z";

  test("active only while the date has not passed", () => {
    expect(isGrantActive({ status: "active", expires_at: null })).toBe(true);
    expect(isGrantActive({ status: "active", expires_at: future })).toBe(true);
    expect(isGrantActive({ status: "active", expires_at: past })).toBe(false);
    expect(isGrantActive({ status: "expired", expires_at: future })).toBe(false);
    expect(isGrantActive({ status: "pending" })).toBe(false);
  });

  test("ended: reported as expired, or active past its date; never revoked or pending", () => {
    expect(isGrantEnded({ status: "expired" })).toBe(true);
    expect(isGrantEnded({ status: "active", expires_at: past })).toBe(true);
    expect(isGrantEnded({ status: "revoked", expires_at: past })).toBe(false);
    expect(isGrantEnded({ status: "pending", expires_at: past })).toBe(false);
  });

  test("a grant without a sections field means sections are not supported", () => {
    expect(sectionsSupported([])).toBe(true);
    expect(sectionsSupported([{ sections: null }, { sections: ["files"] }])).toBe(true);
    expect(sectionsSupported([{ sections: null }, { status: "active" }])).toBe(false);
  });
});

test("preview end dates", () => {
  const from = new Date(2026, 10, 26, 12, 0, 0);
  expect(expiryDate("7d", from)).toEqual(new Date(2026, 11, 3, 12, 0, 0));
  expect(expiryDate("30d", from)).toEqual(new Date(2026, 11, 26, 12, 0, 0));
  expect(expiryDate("1y", from)).toEqual(new Date(2027, 10, 26, 12, 0, 0));
  expect(expiryDate("until_revoked", from)).toBeNull();
});

describe("grantMatchesChoice", () => {
  const start = "2026-11-26T12:00:00.000Z";
  const week = "2026-12-03T12:00:00.000Z";
  const choice = { sections: ["vaccines", "files"], expiry: "7d" };
  const grant = (over) => ({
    status: "active",
    scopes: ["record_sections"],
    sections: ["files", "vaccines"],
    granted_at: start,
    expires_at: week,
    ...over,
  });

  test("exactly the choice, in any order", () => {
    expect(grantMatchesChoice(grant(), choice)).toBe(true);
    expect(grantMatchesChoice(grant({ expires_at: null }), { ...choice, expiry: "until_revoked" })).toBe(true);
    expect(grantMatchesChoice(grant({ expires_at: "2027-11-26T12:00:00.000Z" }), { ...choice, expiry: "1y" })).toBe(true);
    expect(grantMatchesChoice(grant({ expires_at: "2026-12-26T12:00:00.000Z" }), { ...choice, expiry: "30d" })).toBe(true);
  });

  test.each([
    ["no grant", null],
    ["not active", grant({ status: "pending" })],
    ["the older shape", { status: "active", scopes: ["medical_read"], expires_at: null }],
    ["sections ignored", grant({ sections: null })],
    ["sections field missing", grant({ sections: undefined })],
    ["an extra scope", grant({ scopes: ["record_sections", "medical_read"] })],
    ["another scope", grant({ scopes: ["medical_read"] })],
    ["one section more", grant({ sections: ["files", "vaccines", "insurance"] })],
    ["one section fewer", grant({ sections: ["files"] })],
    ["a different section", grant({ sections: ["files", "photos"] })],
    ["a repeated section", grant({ sections: ["files", "files"] })],
    ["no end date although one was chosen", grant({ expires_at: null })],
    ["a longer end date", grant({ expires_at: "2026-12-26T12:00:00.000Z" })],
    ["an end date before the start", grant({ expires_at: "2026-11-19T12:00:00.000Z" })],
  ])("rejects %s", (_name, given) => {
    expect(grantMatchesChoice(given, choice)).toBe(false);
  });

  test("an end date is rejected when the owner chose until revoked", () => {
    expect(grantMatchesChoice(grant(), { ...choice, expiry: "until_revoked" })).toBe(false);
    expect(grantMatchesChoice(grant({ expires_at: undefined }), { ...choice, expiry: "until_revoked" })).toBe(false);
  });

  test("an unknown expiry key never matches", () => {
    expect(grantMatchesChoice(grant(), { ...choice, expiry: "forever" })).toBe(false);
  });
});

describe("grantAccessLines", () => {
  const t = (key) => key;

  test("a grant by section lists exactly its sections", () => {
    expect(grantAccessLines({ scopes: ["record_sections"], sections: ["insurance", "photos"] }, t)).toEqual([
      "vetShare.section.insurance.title",
      "vetShare.section.photos.title",
    ]);
  });

  test("the older read grant spells out everything it opens, plus any write scopes", () => {
    expect(
      grantAccessLines({ scopes: ["medical_read", "medical_write", "vaccinations_write"], sections: null }, t),
    ).toEqual([
      "vetShare.older.medical",
      "vetShare.older.notes",
      "vetShare.older.vaccines",
      "vetShare.older.files",
      "vetShare.can.medicalWrite",
      "vetShare.can.vaccinationsWrite",
    ]);
  });

  test("an unknown scope or section is shown as is, never hidden", () => {
    expect(grantAccessLines({ scopes: ["new_scope"] }, t)).toEqual(["new_scope"]);
    expect(grantAccessLines({ scopes: ["record_sections"], sections: ["new_part"] }, t)).toEqual(["new_part"]);
  });
});

describe("hasBookingForPet", () => {
  const b = (over) => ({ pet_id: 7, provider_id: 3, capability: "vet", booking_status: "confirmed", ...over });

  test("any booking with that business for that dog counts, upcoming or past, whatever the capability", () => {
    expect(hasBookingForPet({ upcoming: [b()], past: [] }, 3, 7)).toBe(true);
    expect(hasBookingForPet({ upcoming: [], past: [b({ capability: "grooming" })] }, "3", "7")).toBe(true);
    expect(hasBookingForPet({ upcoming: [b({ booking_status: "requested" })], past: [] }, 3, 7)).toBe(true);
  });

  test("another dog, another business, a cancelled or declined booking, or unknown bookings do not", () => {
    expect(hasBookingForPet({ upcoming: [b({ pet_id: 8 })], past: [] }, 3, 7)).toBe(false);
    expect(hasBookingForPet({ upcoming: [b({ provider_id: 4 })], past: [] }, 3, 7)).toBe(false);
    expect(hasBookingForPet({ upcoming: [b({ booking_status: "cancelled" })], past: [] }, 3, 7)).toBe(false);
    expect(hasBookingForPet({ upcoming: [b({ booking_status: "declined" })], past: [] }, 3, 7)).toBe(false);
    expect(hasBookingForPet({ upcoming: [b({ provider_id: null })], past: [] }, null, 7)).toBe(false);
    expect(hasBookingForPet(undefined, 3, 7)).toBe(false);
  });
});

describe("visibleInvites", () => {
  test("keeps every open invite and only the most recent others", () => {
    const closed = Array.from({ length: 8 }, (_, i) => ({ id: i, status: "expired" }));
    const open = [{ id: 20, status: "open" }, { id: 21, status: "open" }];
    expect(visibleInvites([...closed, ...open]).map((i) => i.id)).toEqual([20, 21, 0, 1, 2, 3, 4]);
    expect(visibleInvites(undefined)).toEqual([]);
  });
});

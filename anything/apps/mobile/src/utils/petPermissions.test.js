// The role -> action matrix, pinned 1:1 to the server (docs/family-sharing-audit-2026-11.md §3, roadmap PR3 / PR3b). If this table changes, the
// server routes / RLS must change with it (and vice versa): that is the whole point of having ONE helper.

import fs from "fs";
import path from "path";
import {
  PET_ACTIONS,
  PET_ROLES,
  canDo,
  canDoOnPet,
  canDoOnPetOrUnknown,
  roleOfPet,
  isSharedPet,
  ownerNameOfPet,
} from "./petPermissions";

// action -> [owner, family, caregiver]
const MATRIX = {
  viewPet: [true, true, true],
  viewHealthLogs: [true, true, true],
  logHealth: [true, true, true],
  completeReminder: [true, true, true],
  viewRoutines: [true, true, true],
  viewMedicalProfile: [true, true, true],
  viewMedications: [true, true, true],
  viewEmergencyCard: [true, true, true],
  viewAllergiesConditions: [true, true, true],
  editPetProfile: [true, true, false],
  editRoutines: [true, true, false],
  editMedicalProfile: [true, true, false],
  editMedications: [true, true, false],
  viewVaccinations: [true, true, false],
  editVaccinations: [true, true, false],
  viewAppointments: [true, true, false],
  editAppointments: [true, true, false],
  viewVetRecord: [true, true, false],
  addVetRecord: [true, true, false],
  postMoment: [true, true, false],
  useMedia: [true, true, false],
  deleteVetRecord: [true, false, false],
  editEmergencyCard: [true, false, false],
  manageSharing: [true, false, false],
  deletePet: [true, false, false],
  leaveSharing: [false, true, true],
};

describe("canDo: the role matrix", () => {
  test("every action in the helper is covered by the matrix here (and vice versa)", () => {
    expect(Object.keys(PET_ACTIONS).sort()).toEqual(Object.keys(MATRIX).sort());
  });

  describe.each(Object.entries(MATRIX))("%s", (action, [owner, family, caregiver]) => {
    test(`owner ${owner} / family ${family} / caregiver ${caregiver}`, () => {
      expect(canDo("owner", action)).toBe(owner);
      expect(canDo("family", action)).toBe(family);
      expect(canDo("caregiver", action)).toBe(caregiver);
    });
  });

  test("the three promises of the product, stated plainly", () => {
    // family: everything except managing sharing and deleting the pet
    const familyDenied = Object.keys(PET_ACTIONS).filter((a) => !canDo("family", a)).sort();
    expect(familyDenied).toEqual(["deletePet", "deleteVetRecord", "editEmergencyCard", "manageSharing"]);
    // caregiver: read + log / complete only
    for (const a of ["logHealth", "completeReminder", "viewRoutines", "viewHealthLogs"]) expect(canDo("caregiver", a)).toBe(true);
    for (const a of ["editRoutines", "editPetProfile", "editMedicalProfile", "viewVaccinations", "viewAppointments", "viewVetRecord", "postMoment"]) {
      expect(canDo("caregiver", a)).toBe(false);
    }
    // only a member can "leave"; the owner manages
    expect(canDo("owner", "leaveSharing")).toBe(false);
  });

  test("fails CLOSED: an unknown role, no role or an unknown action is never allowed", () => {
    expect(canDo("admin", "viewPet")).toBe(false);
    expect(canDo(null, "viewPet")).toBe(false);
    expect(canDo(undefined, "logHealth")).toBe(false);
    expect(canDo("owner", "launchRockets")).toBe(false);
  });

  test("PET_ROLES lists exactly the three server roles", () => {
    expect(PET_ROLES).toEqual(["owner", "family", "caregiver"]);
  });
});

describe("roleOfPet", () => {
  test("uses the server's access_role", () => {
    expect(roleOfPet({ id: 1, access_role: "owner" })).toBe("owner");
    expect(roleOfPet({ id: 1, access_role: "family", is_shared: true })).toBe("family");
    expect(roleOfPet({ id: 1, access_role: "caregiver", is_shared: true })).toBe("caregiver");
  });

  test("an old server / the default list sends no role: that list is owned pets only, so owner", () => {
    expect(roleOfPet({ id: 1, name: "Rex" })).toBe("owner");
  });

  test("a SHARED pet with a missing or unknown role gets the most restricted role, never owner controls", () => {
    expect(roleOfPet({ id: 1, is_shared: true })).toBe("caregiver");
    expect(roleOfPet({ id: 1, is_shared: true, access_role: "superuser" })).toBe("caregiver");
  });

  test("no pet, no role", () => {
    expect(roleOfPet(null)).toBeNull();
    expect(roleOfPet(undefined)).toBeNull();
  });
});

describe("canDoOnPet / canDoOnPetOrUnknown / isSharedPet / ownerNameOfPet", () => {
  const family = { id: 2, is_shared: true, access_role: "family", owner_display: { full_name: " Sam ", username: "sam1" } };
  const caregiver = { id: 3, is_shared: true, access_role: "caregiver", owner_display: { full_name: null, username: "pawpi_ab12" } };
  const own = { id: 4, is_shared: false, access_role: "owner" };

  test("canDoOnPet follows the pet's role", () => {
    expect(canDoOnPet(family, "editRoutines")).toBe(true);
    expect(canDoOnPet(caregiver, "editRoutines")).toBe(false);
    expect(canDoOnPet(own, "manageSharing")).toBe(true);
    expect(canDoOnPet(null, "viewPet")).toBe(false);
  });

  test("canDoOnPetOrUnknown only relaxes the NO-pet case", () => {
    expect(canDoOnPetOrUnknown(null, "manageSharing")).toBe(true);
    expect(canDoOnPetOrUnknown(caregiver, "editRoutines")).toBe(false);
    expect(canDoOnPetOrUnknown(family, "manageSharing")).toBe(false);
  });

  test("isSharedPet", () => {
    expect(isSharedPet(family)).toBe(true);
    expect(isSharedPet(own)).toBe(false);
    expect(isSharedPet({ id: 9 })).toBe(false);
    expect(isSharedPet(null)).toBe(false);
  });

  test("ownerNameOfPet returns the public display name only, never the username", () => {
    expect(ownerNameOfPet(family)).toBe("Sam");
    expect(ownerNameOfPet(caregiver)).toBeNull(); // full_name unset: NOT "pawpi_ab12"
    expect(ownerNameOfPet(own)).toBeNull();
  });
});

// Guard: roles are decided here and nowhere else. A screen that compares access_role itself would drift from the server matrix.
describe("guard: no ad-hoc role checks in the UI", () => {
  const SRC = path.join(__dirname, "..");
  const ALLOWED = new Set([
    "utils/petPermissions.js",
    "utils/petPermissions.test.js",
    "hooks/usePetPermissions.js",
  ]);
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === "node_modules" || e.name === "__tests__" ? [] : walk(full);
      return /\.(js|jsx|ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [full] : [];
    });

  test("only the permission helper reads pet.access_role", () => {
    const offenders = walk(SRC)
      .filter((f) => !ALLOWED.has(path.relative(SRC, f)))
      .filter((f) => /\.access_role\b|\baccess_role\s*[!=]==|\baccess_role\s*\?/.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(SRC, f));
    expect(offenders).toEqual([]);
  });
});

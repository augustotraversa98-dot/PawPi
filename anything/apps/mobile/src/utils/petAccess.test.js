// What the app does when the person's access to a SHARED pet changes or is lost (revoked / left / expired).
const mockPending = [];
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(async () => mockPending.slice()),
  cancelScheduledNotificationAsync: jest.fn(async (id) => {
    const i = mockPending.findIndex((p) => p.identifier === id);
    if (i >= 0) mockPending.splice(i, 1);
  }),
}));

import { QueryClient } from "@tanstack/react-query";
import usePetAccessStore, { noteAccessVersion, reconcileSharedPets, resetPetAccessMemory } from "@/store/petAccessStore";
import useSelectedPetStore from "@/store/selectedPetStore";
import {
  PET_ACCESS_REVOKED_CODE,
  isAccessRevokedBody,
  dropPetScopedCaches,
  handleAccessLost,
  onForbiddenResponse,
} from "./petAccess";

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });

beforeEach(() => {
  resetPetAccessMemory();
  useSelectedPetStore.setState({ selectedPetId: null });
});

describe("access_version", () => {
  test("the first value is a baseline (no change), a different one later IS a change, the same one is not", () => {
    expect(noteAccessVersion("aaa111")).toBe(false);
    expect(noteAccessVersion("aaa111")).toBe(false);
    expect(noteAccessVersion("bbb222")).toBe(true);
    expect(usePetAccessStore.getState().accessVersion).toBe("bbb222");
  });

  test("an old server (no value) changes nothing", () => {
    noteAccessVersion("aaa111");
    expect(noteAccessVersion(undefined)).toBe(false);
    expect(noteAccessVersion("")).toBe(false);
    expect(usePetAccessStore.getState().accessVersion).toBe("aaa111");
  });

  test("resetting forgets the previous person's baseline", () => {
    noteAccessVersion("aaa111");
    resetPetAccessMemory();
    expect(noteAccessVersion("zzz999")).toBe(false);
  });
});

describe("reconcileSharedPets: a shared pet that disappears from the list is an access loss", () => {
  const own = { id: 1, name: "Mango", is_shared: false };
  const shared = { id: 7, name: "Luna", is_shared: true };

  test("first read: nothing lost; later read without the shared pet: it is reported once", () => {
    expect(reconcileSharedPets([own, shared])).toEqual([]);
    expect(reconcileSharedPets([own, shared])).toEqual([]);
    expect(reconcileSharedPets([own])).toEqual([{ id: 7, name: "Luna" }]);
    expect(reconcileSharedPets([own])).toEqual([]); // not reported again
  });

  test("an OWN pet disappearing is never an access loss; a new shared pet is not a loss", () => {
    reconcileSharedPets([own]);
    expect(reconcileSharedPets([])).toEqual([]);
    expect(reconcileSharedPets([shared])).toEqual([]);
  });

  test("a junk answer is ignored", () => {
    expect(reconcileSharedPets(undefined)).toEqual([]);
    expect(reconcileSharedPets(null)).toEqual([]);
  });

  test("after sign-out / account switch nothing carries over", () => {
    reconcileSharedPets([own, shared]);
    resetPetAccessMemory();
    expect(reconcileSharedPets([own])).toEqual([]);
  });
});

describe("dropPetScopedCaches", () => {
  test("removes queries keyed to the lost pet, keeps other pets' and the pets list", () => {
    const qc = newClient();
    qc.setQueryData(["pets"], [{ id: 1 }]);
    qc.setQueryData(["care-ring", 7, "2026-11-24"], { x: 1 });
    qc.setQueryData(["pet-grants", 7], []);
    qc.setQueryData(["vet-appointments", "7"], []);
    qc.setQueryData(["care-ring", 1, "2026-11-24"], { x: 2 });
    qc.setQueryData(["providers", "mine"], []);
    dropPetScopedCaches(qc, 7);
    expect(qc.getQueryData(["care-ring", 7, "2026-11-24"])).toBeUndefined();
    expect(qc.getQueryData(["pet-grants", 7])).toBeUndefined();
    expect(qc.getQueryData(["vet-appointments", "7"])).toBeUndefined();
    expect(qc.getQueryData(["care-ring", 1, "2026-11-24"])).toEqual({ x: 2 });
    expect(qc.getQueryData(["providers", "mine"])).toEqual([]);
    expect(qc.getQueryData(["pets"])).toEqual([{ id: 1 }]);
  });

  test("never throws on junk", () => {
    expect(() => dropPetScopedCaches(null, 7)).not.toThrow();
    expect(() => dropPetScopedCaches(newClient(), null)).not.toThrow();
  });
});

describe("handleAccessLost", () => {
  test("clears the pet's caches, forgets a selection pointing at it, and queues ONE friendly notice naming the dog", () => {
    const qc = newClient();
    qc.setQueryData(["care-ring", 7, "d"], { x: 1 });
    useSelectedPetStore.setState({ selectedPetId: 7 });
    const invalidate = jest.spyOn(qc, "invalidateQueries");

    handleAccessLost(qc, { id: 7, name: "Luna" });

    expect(qc.getQueryData(["care-ring", 7, "d"])).toBeUndefined();
    expect(useSelectedPetStore.getState().selectedPetId).toBeNull();
    expect(usePetAccessStore.getState().lostNotice).toEqual({ petId: 7, petName: "Luna" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["pets"] });
  });

  test("a selection on ANOTHER dog is left alone", () => {
    const qc = newClient();
    useSelectedPetStore.setState({ selectedPetId: 1 });
    handleAccessLost(qc, { id: 7, name: "Luna" });
    expect(useSelectedPetStore.getState().selectedPetId).toBe(1);
  });

  test("refetchPets:false (used from inside the pets fetch itself) does not re-invalidate the pets list", () => {
    const qc = newClient();
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    handleAccessLost(qc, { id: 7, name: "Luna" }, { refetchPets: false });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["pets"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["shared-with-me"] });
  });

  test("cancels only that dog's pending alarms", async () => {
    mockPending.length = 0;
    mockPending.push(
      { identifier: "reminder_5_0_d1", content: { data: { reminderId: "reminder_5_0_d1", petId: "7" } } },
      { identifier: "reminder_9_0_d1", content: { data: { reminderId: "reminder_9_0_d1", petId: "1" } } },
      { identifier: "pawpi-daily-return", content: { data: { kind: "daily_return" } } },
    );
    await handleAccessLost(newClient(), { id: 7, name: "Luna" });
    expect(mockPending.map((p) => p.identifier)).toEqual(["reminder_9_0_d1", "pawpi-daily-return"]);
  });

  test("a pet with no id is ignored (no notice)", () => {
    handleAccessLost(newClient(), {});
    expect(usePetAccessStore.getState().lostNotice).toBeNull();
  });
});

describe("403 pet_access_revoked", () => {
  const response = (status, body) => ({ status, clone: () => ({ json: async () => body }) });

  test("recognises the server's code", () => {
    expect(PET_ACCESS_REVOKED_CODE).toBe("pet_access_revoked");
    expect(isAccessRevokedBody({ error: "x", code: "pet_access_revoked" })).toBe(true);
    expect(isAccessRevokedBody({ code: "something_else" })).toBe(false);
    expect(isAccessRevokedBody(null)).toBe(false);
    expect(isAccessRevokedBody("pet_access_revoked")).toBe(false);
  });

  test("a revoked 403 refetches the pet lists (the list is the authority on what is gone)", async () => {
    const qc = newClient();
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    await onForbiddenResponse(response(403, { error: "Pet not found or access denied", code: "pet_access_revoked" }), qc);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["pets"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["shared-with-me"] });
    // …but it does NOT guess which pet and wipe the current selection
    expect(useSelectedPetStore.getState().selectedPetId).toBeNull();
  });

  test("a plain 403 (no code), a non-JSON body or a response without clone() does nothing", async () => {
    const qc = newClient();
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    await onForbiddenResponse(response(403, { error: "nope" }), qc);
    await onForbiddenResponse({ status: 403, clone: () => ({ json: async () => { throw new Error("not json"); } }) }, qc);
    await onForbiddenResponse({ status: 403 }, qc);
    expect(invalidate).not.toHaveBeenCalled();
  });

  test("the caller can still read the original body (we only read a clone)", async () => {
    const json = jest.fn(async () => ({ code: "pet_access_revoked" }));
    const res = { status: 403, clone: () => ({ json }), json: jest.fn() };
    await onForbiddenResponse(res, newClient());
    expect(res.json).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledTimes(1);
  });
});

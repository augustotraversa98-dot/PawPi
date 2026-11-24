// The active pet with SHARED dogs in the list (family sharing, PR5a): real useCurrentPet / usePetProfile / usePetPermissions over a real
// React Query cache; only the network is faked.
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/utils/queryClient";
import useSelectedPetStore from "@/store/selectedPetStore";
import usePetAccessStore, { resetPetAccessMemory } from "@/store/petAccessStore";
import { useCurrentPet, usePetProfile, useCreatePet } from "./usePetProfile";
import { usePetPermissions } from "./usePetPermissions";

const own = { id: 1, name: "Mango", is_shared: false, access_role: "owner" };
const family = {
  id: 7, name: "Luna", is_shared: true, access_role: "family", grant_id: 3,
  owner_display: { full_name: "Sam", username: "sam", avatar_url: null },
};
const caregiver = { ...family, id: 8, name: "Rocky", access_role: "caregiver" };

const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
const json = (body, status = 200) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body });

let pets;
let failing;
beforeEach(() => {
  queryClient.clear();
  resetPetAccessMemory();
  useSelectedPetStore.setState({ selectedPetId: null, hasHydrated: true });
  failing = false;
  pets = [];
  global.fetch = jest.fn(async (url, init) => {
    if (String(url).startsWith("/api/pets") && (!init || !init.method || init.method === "GET")) {
      return failing ? json({}, 500) : json({ pets, access_version: "v1" });
    }
    return json({ pet: { id: 99 } }, 201);
  });
});

const mount = () => renderHook(() => ({ cur: useCurrentPet(), perms: usePetPermissions() }), { wrapper });

test("a person whose ONLY dog is shared with them: that dog IS the current pet, with their role and the owner's name", async () => {
  pets = [family];
  const { result } = mount();
  await waitFor(() => expect(result.current.cur.hasPet).toBe(true));
  expect(result.current.cur.data).toMatchObject({ id: 7, name: "Luna", is_shared: true });
  expect(result.current.perms.role).toBe("family");
  expect(result.current.perms.isShared).toBe(true);
  expect(result.current.perms.ownerName).toBe("Sam");
  expect(result.current.perms.can("editRoutines")).toBe(true);
  expect(result.current.perms.can("manageSharing")).toBe(false);
  // and the persisted selection now points at it
  await waitFor(() => expect(useSelectedPetStore.getState().selectedPetId).toBe(7));
});

test("an owner of a dog who also has one shared: own pet is the default; picking the shared one persists and sticks", async () => {
  pets = [own, caregiver];
  const { result } = mount();
  await waitFor(() => expect(result.current.cur.data?.id).toBe(1));
  expect(result.current.perms.role).toBe("owner");

  act(() => result.current.cur.setCurrentPet(8));
  await waitFor(() => expect(result.current.cur.data?.id).toBe(8));
  expect(result.current.perms.role).toBe("caregiver");
  expect(result.current.perms.can("logHealth")).toBe(true);
  expect(result.current.perms.can("editRoutines")).toBe(false);
  // The effect that reconciles the stored choice with the list must NOT revert a shared selection (the household screen used to be reverted).
  await new Promise((r) => setTimeout(r, 20));
  expect(useSelectedPetStore.getState().selectedPetId).toBe(8);
  expect(result.current.cur.data?.id).toBe(8);
});

test("a stored selection of a shared dog survives a restart (still in the list)", async () => {
  pets = [own, family];
  useSelectedPetStore.setState({ selectedPetId: 7, hasHydrated: true });
  const { result } = mount();
  await waitFor(() => expect(result.current.cur.hasPet).toBe(true));
  expect(result.current.cur.data?.id).toBe(7);
});

test("a FAILED read does not wipe a stored shared selection (a transient error must not forget the dog)", async () => {
  failing = true;
  useSelectedPetStore.setState({ selectedPetId: 7, hasHydrated: true });
  const { result } = mount();
  // the shared client retries once after 1.5 s before reporting the error
  await waitFor(() => expect(result.current.cur.isError).toBe(true), { timeout: 5000 });
  expect(result.current.cur.hasPet).toBe(false);
  expect(useSelectedPetStore.getState().selectedPetId).toBe(7);
});

test("a person with NO dog at all: no pet, selection cleared, controls are not role-restricted (nothing to act on)", async () => {
  pets = [];
  useSelectedPetStore.setState({ selectedPetId: 5, hasHydrated: true });
  const { result } = mount();
  await waitFor(() => expect(result.current.cur.isLoading).toBe(false));
  expect(result.current.cur.data).toBeNull();
  expect(result.current.perms.role).toBeNull();
  await waitFor(() => expect(useSelectedPetStore.getState().selectedPetId).toBeNull());
});

test("loading: no pet yet, isLoading true", async () => {
  pets = [own];
  const { result } = mount();
  expect(result.current.cur.isLoading).toBe(true);
  expect(result.current.cur.data).toBeNull();
  expect(result.current.perms.isLoading).toBe(true);
  await waitFor(() => expect(result.current.cur.isLoading).toBe(false));
});

describe("REVOKED: the owner removes this person from the shared dog", () => {
  test("the next list read drops the dog: selection cleared, the person is moved to another dog, ONE friendly notice is queued", async () => {
    pets = [own, family];
    useSelectedPetStore.setState({ selectedPetId: 7, hasHydrated: true });
    queryClient.setQueryData(["care-ring", 7, "2026-11-24"], { done: 1 });
    const { result } = mount();
    await waitFor(() => expect(result.current.cur.data?.id).toBe(7));

    pets = [own]; // revoked
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ["pets"] });
    });

    await waitFor(() => expect(result.current.cur.data?.id).toBe(1));
    expect(useSelectedPetStore.getState().selectedPetId).toBe(1);
    expect(usePetAccessStore.getState().lostNotice).toEqual({ petId: 7, petName: "Luna" });
    expect(queryClient.getQueryData(["care-ring", 7, "2026-11-24"])).toBeUndefined();
  });

  test("a shared-ONLY person who is revoked is left with no dog (the app then shows its no-dog state), not a crash", async () => {
    pets = [family];
    const { result } = mount();
    await waitFor(() => expect(result.current.cur.data?.id).toBe(7));

    pets = [];
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ["pets"] });
    });
    await waitFor(() => expect(result.current.cur.data).toBeNull());
    expect(useSelectedPetStore.getState().selectedPetId).toBeNull();
    expect(usePetAccessStore.getState().lostNotice?.petName).toBe("Luna");
  });

  test("a changed role (family -> caregiver) is picked up from the list: controls follow immediately", async () => {
    pets = [family];
    const { result } = mount();
    await waitFor(() => expect(result.current.perms.role).toBe("family"));
    pets = [{ ...family, access_role: "caregiver" }];
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ["pets"] });
    });
    await waitFor(() => expect(result.current.perms.role).toBe("caregiver"));
    expect(result.current.perms.can("editRoutines")).toBe(false);
  });
});

describe("usePetProfile lists own pets first, then shared", () => {
  test("returns exactly what the server sent, in order", async () => {
    pets = [own, family, caregiver];
    const { result } = renderHook(() => usePetProfile(), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(3));
    expect(result.current.data.map((p) => p.id)).toEqual([1, 7, 8]);
    expect(global.fetch.mock.calls[0][0]).toBe("/api/pets?include_shared=1");
  });
});

describe("useCreatePet sends an Idempotency-Key when given one (and never in the body)", () => {
  test("header present, body clean", async () => {
    const { result } = renderHook(() => useCreatePet(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ name: "Rex", idempotencyKey: "11111111-1111-4111-8111-111111111111" });
    });
    const call = global.fetch.mock.calls.find(([, init]) => init?.method === "POST");
    expect(call[0]).toBe("/api/pets");
    expect(call[1].headers["Idempotency-Key"]).toBe("11111111-1111-4111-8111-111111111111");
    expect(JSON.parse(call[1].body)).toEqual({ name: "Rex" });
  });

  test("no key given: no header (the server's name-window guard still protects)", async () => {
    const { result } = renderHook(() => useCreatePet(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ name: "Rex" });
    });
    const call = global.fetch.mock.calls.find(([, init]) => init?.method === "POST");
    expect(call[1].headers["Idempotency-Key"]).toBeUndefined();
  });
});

// Family sharing (PR5a): data hooks do not ask the server for what the person's role cannot have (the server would 403): a caregiver on a
// shared dog has no vaccines and no vet appointments. Owner and family are unchanged.
import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePetVaccinations } from "./usePetVaccinations";
import { useVetAppointmentReminders } from "./useVetAppointmentReminders";

let mockPet;
jest.mock("./usePetProfile", () => ({ useCurrentPet: () => ({ data: mockPet }) }));

const ownerPet = { id: 1, name: "Mango", is_shared: false, access_role: "owner" };
const familyPet = { id: 7, name: "Luna", is_shared: true, access_role: "family" };
const caregiverPet = { id: 8, name: "Rocky", is_shared: true, access_role: "caregiver" };

let client;
const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const callsTo = (path) => global.fetch.mock.calls.filter(([u]) => String(u).startsWith(path)).length;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["pets"], [ownerPet, familyPet, caregiverPet]);
  global.fetch = jest.fn(async (url) => ({
    ok: true,
    status: 200,
    json: async () => (String(url).includes("vaccinations") ? { vaccinations: [{ id: 1 }] } : { appointments: [] }),
  }));
});

describe("usePetVaccinations", () => {
  test.each([
    ["owner", 1],
    ["family", 7],
  ])("%s: loads the vaccines", async (_n, petId) => {
    const { result } = renderHook(() => usePetVaccinations(petId), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([{ id: 1 }]));
    expect(callsTo("/api/pet-vaccinations")).toBe(1);
  });

  test("caregiver: never asks (no 403, no error state)", async () => {
    const { result } = renderHook(() => usePetVaccinations(8), { wrapper });
    await new Promise((r) => setTimeout(r, 30));
    expect(callsTo("/api/pet-vaccinations")).toBe(0);
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  test("a pet that is not in the cached list keeps the old behaviour (the server decides)", async () => {
    const { result } = renderHook(() => usePetVaccinations(99), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([{ id: 1 }]));
  });
});

describe("useVetAppointmentReminders", () => {
  test.each([
    ["owner", ownerPet],
    ["family", familyPet],
  ])("%s: loads appointments", async (_n, pet) => {
    mockPet = pet;
    const { result } = renderHook(() => useVetAppointmentReminders(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(callsTo("/api/vet-appointments")).toBe(1);
  });

  test("caregiver: never asks", async () => {
    mockPet = caregiverPet;
    const { result } = renderHook(() => useVetAppointmentReminders(), { wrapper });
    await new Promise((r) => setTimeout(r, 30));
    expect(callsTo("/api/vet-appointments")).toBe(0);
    expect(result.current.isError).toBe(false);
  });
});

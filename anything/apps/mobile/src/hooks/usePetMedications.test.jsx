// usePetMedications (NR4) — the owner-side medications hooks hit /api/health/medications,
// key on ["pet-medications", petId], and carry the right method/body per verb.

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  usePetMedications,
  useCreateMedication,
  useUpdateMedication,
  useDeleteMedication,
} from "./usePetMedications";

const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const makeWrapper = (qc) =>
  function Wrapper({ children }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };

let lastUrl;
let lastOpts;
beforeEach(() => {
  lastUrl = undefined;
  lastOpts = undefined;
  global.fetch = jest.fn(async (url, opts) => {
    lastUrl = url;
    lastOpts = opts;
    return { ok: true, json: async () => ({ medications: [], medication: { id: 1 }, ok: true }) };
  });
});
afterEach(() => jest.restoreAllMocks());

test("usePetMedications fetches by petId and keys on the petId", async () => {
  const client = makeClient();
  const { result } = renderHook(() => usePetMedications(7), { wrapper: makeWrapper(client) });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(lastUrl).toBe("/api/health/medications?petId=7");
  expect(client.getQueryData(["pet-medications", 7])).toEqual([]);
});

test("useCreateMedication POSTs petId + payload", async () => {
  const { result } = renderHook(() => useCreateMedication(7), { wrapper: makeWrapper(makeClient()) });
  await result.current.mutateAsync({ name: "Meloxicam" });
  expect(lastUrl).toBe("/api/health/medications");
  expect(lastOpts.method).toBe("POST");
  expect(JSON.parse(lastOpts.body)).toMatchObject({ petId: 7, name: "Meloxicam" });
});

test("useUpdateMedication PATCHes by id (e.g. mark completed)", async () => {
  const { result } = renderHook(() => useUpdateMedication(7), { wrapper: makeWrapper(makeClient()) });
  await result.current.mutateAsync({ id: 42, status: "completed" });
  expect(lastUrl).toBe("/api/health/medications");
  expect(lastOpts.method).toBe("PATCH");
  expect(JSON.parse(lastOpts.body)).toMatchObject({ id: 42, status: "completed" });
});

test("useDeleteMedication DELETEs by id", async () => {
  const { result } = renderHook(() => useDeleteMedication(7), { wrapper: makeWrapper(makeClient()) });
  await result.current.mutateAsync(42);
  expect(lastUrl).toBe("/api/health/medications?id=42");
  expect(lastOpts.method).toBe("DELETE");
});

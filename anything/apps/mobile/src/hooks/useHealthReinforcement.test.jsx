// E10 hooks + copy: the one-tap "all good" writes a real wellness (general) care log; readiness reads
// the real record counts; and the readiness/recap/all-good copy is always positive (no gap-shaming).

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import {
  useLogAllGood,
  useDeleteWellnessLog,
  useVetSummaryReadiness,
} from "./useHealthReinforcement";

function makeWrapper(qc) {
  return function Wrapper({ children }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}
const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

beforeEach(() => {
  global.fetch = jest.fn();
});
afterEach(() => jest.restoreAllMocks());

describe("useLogAllGood", () => {
  it("POSTs a REAL general wellness log (closes the Care segment)", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ log: { id: 1 } }) });
    const { result } = renderHook(() => useLogAllGood(7), { wrapper: makeWrapper(makeClient()) });
    await result.current.mutateAsync();
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/health/wellness-logs");
    expect(JSON.parse(opts.body)).toMatchObject({ petId: 7, checkType: "general" });
  });
});

describe("useDeleteWellnessLog", () => {
  it("DELETEs the wellness log by id (the undo path)", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const { result } = renderHook(() => useDeleteWellnessLog(7), { wrapper: makeWrapper(makeClient()) });
    await result.current.mutateAsync(42);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/health/wellness-logs?id=42");
    expect(opts.method).toBe("DELETE");
  });
});

describe("useVetSummaryReadiness", () => {
  it("reads the readiness indicator", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ filled: 1, total: 4, percent: 25, level: "building" }),
    });
    const { result } = renderHook(() => useVetSummaryReadiness(7), { wrapper: makeWrapper(makeClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.level).toBe("building");
    expect(global.fetch).toHaveBeenCalledWith("/api/pets/7/vet-summary-readiness");
  });
});

describe("E10 copy is positive (never shames gaps)", () => {
  const BANNED = [
    "you forgot", "you haven't", "haven't", "neglect", "missing", "incomplete",
    "you didn't", "empty record", "no records", "gap",
    "olvidaste", "no registraste", "incompleto", "falta", "vacío",
  ];
  function collect(obj, acc = []) {
    if (typeof obj === "string") acc.push(obj);
    else if (obj && typeof obj === "object") for (const v of Object.values(obj)) collect(v, acc);
    return acc;
  }
  it("vetReadiness + careRing all-good check-in copy has no shaming language (EN + ES)", () => {
    for (const dict of [en, es]) {
      const cr = dict.health.careRing;
      const strings = [
        ...collect(dict.vetReadiness),
        cr.allGoodAction,
        cr.allGoodActionHint,
        cr.allGoodConfirmTitle,
        cr.allGoodConfirmBody,
        cr.allGoodLogged,
        cr.allGoodUndo,
        dict.share.recapSub,
        dict.share.deckRecapReady,
      ];
      for (const s of strings) {
        const low = String(s).toLowerCase();
        for (const bad of BANNED) expect(low.includes(bad)).toBe(false);
      }
    }
  });
});

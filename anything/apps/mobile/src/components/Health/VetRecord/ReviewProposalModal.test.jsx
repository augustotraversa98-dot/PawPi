// AI-2 (night-run 2026-08-18d) — the review sheet: a mocked proposal renders grouped, editable
// records; skip removes one from the apply; confirm POSTs each accepted record to its VR-B add
// route (with the source marker) and refreshes the history queries. Native deps + react-query are
// mocked so the test is fast and deterministic.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

const mockInvalidate = jest.fn();

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => {
  const en = require("@/i18n/locales/en.json");
  const resolve = (key) =>
    key.split(".").reduce((o, k) => (o == null ? o : o[k]), en);
  return {
    useTranslation: () => ({
      t: (key, opts) => {
        // support the pluralized addCount_one / addCount_other used by the footer
        if (key === "health.vetRecord.review.addCount" && opts) {
          const v = resolve(
            `health.vetRecord.review.addCount_${opts.count === 1 ? "one" : "other"}`,
          );
          return typeof v === "string"
            ? v.replace("{{count}}", String(opts.count))
            : key;
        }
        const v = resolve(key);
        return typeof v === "string" ? v : key;
      },
    }),
  };
});
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));
jest.mock("@/components/KeyboardAwareScrollView", () => {
  const { ScrollView } = require("react-native");
  return (props) => <ScrollView {...props} />;
});
jest.mock("@/utils/dateUtils", () => ({
  getLocalPostDateString: () => "2026-06-18",
}));

import { ReviewProposalModal } from "./ReviewProposalModal";

const proposal = {
  docType: "vaccination_card",
  records: {
    vaccinations: [
      { name: "Rabies", dateGiven: "2025-01-02", expiresOn: null, clinicName: "VetCo", notes: null },
    ],
    surgeries: [
      { procedure: "Neuter", surgeryDate: null, surgeon: null, clinic: null, notes: null },
    ],
  },
};

beforeEach(() => {
  mockInvalidate.mockReset();
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  );
});

test("renders the proposed records grouped by type", () => {
  const { getByText, getByTestId } = render(
    <ReviewProposalModal visible proposal={proposal} petId={3} onClose={jest.fn()} onApplied={jest.fn()} />,
  );
  expect(getByText("PawPi read your document")).toBeTruthy();
  expect(getByText("Vaccines")).toBeTruthy();
  expect(getByText("Surgeries")).toBeTruthy();
  expect(getByTestId("proposed-vaccinations-0")).toBeTruthy();
  expect(getByTestId("proposed-surgeries-0")).toBeTruthy();
});

test("confirm applies each included record to its VR-B route + marks the source", async () => {
  const onApplied = jest.fn();
  const onClose = jest.fn();
  const { getByTestId } = render(
    <ReviewProposalModal visible proposal={proposal} petId={3} onClose={onClose} onApplied={onApplied} />,
  );

  fireEvent.press(getByTestId("apply-records"));

  await waitFor(() => expect(onApplied).toHaveBeenCalled());
  const urls = global.fetch.mock.calls.map((c) => c[0]);
  expect(urls).toContain("/api/pet-vaccinations");
  expect(urls).toContain("/api/vet-record/surgeries");

  // vaccination body carries the fields + the source marker in notes
  const vax = JSON.parse(
    global.fetch.mock.calls.find((c) => c[0] === "/api/pet-vaccinations")[1].body,
  );
  expect(vax).toMatchObject({ petId: 3, name: "Rabies", dateGiven: "2025-01-02" });
  expect(vax.notes).toContain("Digitized from uploaded document");

  // surgery needs a date — the null is filled with today's date so the route accepts it
  const surg = JSON.parse(
    global.fetch.mock.calls.find((c) => c[0] === "/api/vet-record/surgeries")[1].body,
  );
  expect(surg.surgeryDate).toBe("2026-06-18");

  // history queries were refreshed
  expect(mockInvalidate).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});

test("skipping a record excludes it from the apply", async () => {
  const { getByTestId } = render(
    <ReviewProposalModal visible proposal={proposal} petId={3} onClose={jest.fn()} onApplied={jest.fn()} />,
  );
  // skip the surgery
  fireEvent.press(getByTestId("toggle-surgeries-0"));
  fireEvent.press(getByTestId("apply-records"));

  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  const urls = global.fetch.mock.calls.map((c) => c[0]);
  expect(urls).toContain("/api/pet-vaccinations");
  expect(urls).not.toContain("/api/vet-record/surgeries");
});

// AUDIT_2026-09 A-13: Photo History renders the pet's REAL photo checks — never the seeded
// sample gallery — with loading, error + retry, and empty states.
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockQuery;
jest.mock("@/hooks/useFetchHealthData", () => ({ usePhotoChecks: () => mockQuery }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());

import PhotoHistory, { groupPhotoChecksByArea } from "./PhotoHistory";

const refetch = jest.fn();
const ready = (photoChecks) => ({ data: { photoChecks }, isLoading: false, isError: false, refetch });

test("groups API rows (snake_case) by body area, newest first", () => {
  const grouped = groupPhotoChecksByArea([
    { id: 1, body_area: "paws", image_url: "u1", created_at: "2026-09-01T10:00:00Z" },
    { id: 2, body_area: "paws", image_url: "u2", created_at: "2026-09-05T10:00:00Z" },
    { id: 3, body_area: "eyes", image_url: "u3", created_at: "2026-09-02T10:00:00Z" },
  ]);
  expect(Object.keys(grouped).sort()).toEqual(["eyes", "paws"]);
  expect(grouped.paws.map((p) => p.id)).toEqual([2, 1]);
  expect(grouped.paws[0].imageUrl).toBe("u2");
});

test("empty history shows the empty state, not sample photos", () => {
  mockQuery = ready([]);
  const { getByText, queryByText } = render(<PhotoHistory />);
  expect(getByText("No photo checks yet")).toBeTruthy();
  expect(queryByText("Looking good, no redness")).toBeNull();
});

test("shows a spinner while loading", () => {
  mockQuery = { data: undefined, isLoading: true, isError: false, refetch };
  const { queryByText, UNSAFE_getByType } = render(<PhotoHistory />);
  expect(queryByText("No photo checks yet")).toBeNull();
  expect(UNSAFE_getByType(require("react-native").ActivityIndicator)).toBeTruthy();
});

test("a failed fetch shows an error with Retry", () => {
  mockQuery = { data: undefined, isLoading: false, isError: true, refetch };
  const { getByTestId, getByText } = render(<PhotoHistory />);
  expect(getByTestId("photo-history-error")).toBeTruthy();
  fireEvent.press(getByText("Try again"));
  expect(refetch).toHaveBeenCalled();
});

test("real rows render their body-area group", () => {
  mockQuery = ready([
    { id: 9, body_area: "ears", image_url: "https://x/y.jpg", created_at: "2026-09-01T10:00:00Z" },
  ]);
  const { getByText } = render(<PhotoHistory />);
  expect(getByText("Ears")).toBeTruthy();
});

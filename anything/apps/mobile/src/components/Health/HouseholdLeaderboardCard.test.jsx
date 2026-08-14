// Render pins for the HouseholdLeaderboardCard (E13 PR3): renders a real household (2+ members),
// badges the most-active member, shows per-member stats, and renders NOTHING for a solo owner or an
// opted-out household. i18n via the real English catalog.

import React from "react";
import { render } from "@testing-library/react-native";

let mockData;

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("@/hooks/useHouseholdLeaderboard", () => ({
  useHouseholdLeaderboard: () => mockData,
}));

import { HouseholdLeaderboardCard } from "./HouseholdLeaderboardCard";

test("renders the household with a most-active badge and no shame copy", () => {
  mockData = {
    data: {
      opted_out: false,
      most_active_user_id: 2,
      members: [
        { member_user_id: 2, username: "sofia", moments: 3, care_actions: 12, walks: 4, total: 19 },
        { member_user_id: 1, username: "tats", moments: 1, care_actions: 2, walks: 1, total: 4 },
      ],
    },
  };
  const { getByTestId, queryByText } = render(<HouseholdLeaderboardCard petId={1} />);
  expect(getByTestId("household-leaderboard")).toBeTruthy();
  expect(getByTestId("most-active-2")).toBeTruthy();
  expect(getByTestId("household-member-1")).toBeTruthy();
  // No least-active / shame wording anywhere.
  expect(queryByText(/least active|did the least|slack/i)).toBeNull();
});

test("renders nothing for a solo owner (single member)", () => {
  mockData = { data: { opted_out: false, members: [{ member_user_id: 1, username: "tats", total: 5 }] } };
  const { queryByTestId } = render(<HouseholdLeaderboardCard petId={1} />);
  expect(queryByTestId("household-leaderboard")).toBeNull();
});

test("renders nothing when the household opted out", () => {
  mockData = { data: { opted_out: true, members: [] } };
  const { queryByTestId } = render(<HouseholdLeaderboardCard petId={1} />);
  expect(queryByTestId("household-leaderboard")).toBeNull();
});

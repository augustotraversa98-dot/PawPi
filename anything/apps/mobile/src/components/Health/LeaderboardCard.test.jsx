// Care leagues card copy: title, tabs, a short empty line and one short XP note. EN + ES.
import React from "react";
import { render } from "@testing-library/react-native";

let mockLang = "en";
jest.mock("react-i18next", () => ({
  useTranslation: () =>
    require("@/i18n/testMock").makeReactI18nextMock(mockLang).useTranslation(),
}));
jest.mock("@/hooks/useLeaderboard", () => ({
  useLeaderboard: () => ({ data: { board: [] } }),
  useSetLeaderboardArea: () => ({ mutate: jest.fn() }),
}));

import { LeaderboardCard } from "./LeaderboardCard";

test.each([
  ["en", "Care leagues 🏆", "No XP yet this week.", "Weekly XP: walks, ring closes, care actions and paws you give."],
  ["es", "Ligas de cuidado 🏆", "Todavía no hay XP esta semana.", "XP semanal: paseos, anillos cerrados, acciones de cuidado y patitas que das."],
])("shows only the title, the empty line and the XP note (%s)", (lang, title, empty, note) => {
  mockLang = lang;
  const { getByText, queryByText } = render(<LeaderboardCard petId={1} />);
  expect(getByText(title)).toBeTruthy();
  expect(getByText(empty)).toBeTruthy();
  expect(getByText(note)).toBeTruthy();
  expect(queryByText(/not likes|no por likes|never popularity|nunca popularidad|leaderboard\./)).toBeNull();
});

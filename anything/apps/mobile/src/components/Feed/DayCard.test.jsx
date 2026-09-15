// Render pins for the multi-caregiver DayCard (E13 PR2 + FF3 parity fix): a slide per author,
// per-slide attribution, the "N caregivers" header when multiple authors, 4:5 parity chrome
// (@handle, 🔥 streak, "Daily moment" tag, timestamp), and a REAL paw state driven by the active
// slide's own like data (filled coral only when actually pawed, next to that post's own count).
// i18n via the real English catalog. lucide is NOT mocked so the paw's fill/color is inspectable
// (same convention as PostCard.test).

import React from "react";
import { render } from "@testing-library/react-native";
import { PawPrint } from "lucide-react-native";

jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());

import { DayCard } from "./DayCard";

const CORAL = "#FF6F61";

const twoAuthorCard = {
  pet: { id: 1, name: "Rex", avatar_url: "rex.png" },
  author_count: 2,
  paw_count: 5,
  bark_count: 2,
  latest_contribution_at: "2026-08-13T18:00:00Z",
  slides: [
    {
      post_id: 10,
      image_url: "a.png",
      caption: "morning walk",
      created_at: "2026-08-13T09:00:00Z",
      author: { id: 1, username: "tats" },
      _post: { id: 10, pet_handle: "rex", paw_count: 5, bark_count: 2, created_at: "2026-08-13T09:00:00Z" },
    },
    {
      post_id: 11,
      image_url: "b.png",
      caption: "evening nap",
      created_at: "2026-08-13T18:00:00Z",
      author: { id: 2, username: "sofia" },
      _post: { id: 11, pet_handle: "rex", paw_count: 3, bark_count: 1, created_at: "2026-08-13T18:00:00Z" },
    },
  ],
};

test("renders one slide per author with the multi-caregiver header", () => {
  const { getByTestId } = render(<DayCard dayCard={twoAuthorCard} />);
  expect(getByTestId("day-card")).toBeTruthy();
  expect(getByTestId("day-card-slide-10")).toBeTruthy();
  expect(getByTestId("day-card-slide-11")).toBeTruthy();
  expect(getByTestId("day-card-authors")).toHaveTextContent("2 caregivers shared today 🐾");
});

test("brings PostCard parity chrome: @handle, 🔥 streak, Daily moment tag, timestamp", () => {
  const { getByTestId, getByText } = render(<DayCard dayCard={twoAuthorCard} streak={4} />);
  expect(getByTestId("day-card-handle")).toHaveTextContent("@rex");
  expect(getByText("🔥4")).toBeTruthy();
  expect(getByText("Daily moment")).toBeTruthy();
  expect(getByTestId("day-card-time")).toBeTruthy();
});

test("attributes the active slide to its author and shows that slide's own paw count", () => {
  const { getByTestId, getByText } = render(<DayCard dayCard={twoAuthorCard} />);
  expect(getByTestId("day-card-author")).toHaveTextContent("Posted by tats");
  // Active slide is post 10 (paw_count 5) — the consistent per-slide total, not a day aggregate.
  expect(getByText("5")).toBeTruthy();
});

test("paw is UNFILLED when the active slide's post is not liked (no more red-but-zero)", () => {
  const { UNSAFE_getAllByType } = render(<DayCard dayCard={twoAuthorCard} likedByPostId={{}} />);
  const paw = UNSAFE_getAllByType(PawPrint)[0];
  expect(paw.props.fill).toBe("none");
});

test("paw is FILLED coral only when the active slide's post is actually pawed", () => {
  const { UNSAFE_getAllByType } = render(
    <DayCard dayCard={twoAuthorCard} likedByPostId={{ 10: true }} />,
  );
  const paw = UNSAFE_getAllByType(PawPrint)[0];
  expect(paw.props.fill).toBe(CORAL);
  expect(paw.props.color).toBe(CORAL);
});

test("a single-author day renders no multi-caregiver header", () => {
  const solo = {
    pet: { id: 1, name: "Rex" },
    author_count: 1,
    paw_count: 0,
    bark_count: 0,
    slides: [{ post_id: 10, image_url: "a.png", author: { id: 1, username: "tats" }, _post: { id: 10 } }],
  };
  const { queryByTestId } = render(<DayCard dayCard={solo} />);
  expect(queryByTestId("day-card-authors")).toBeNull();
});

test("an empty day renders nothing", () => {
  const { queryByTestId } = render(<DayCard dayCard={{ slides: [] }} />);
  expect(queryByTestId("day-card")).toBeNull();
});

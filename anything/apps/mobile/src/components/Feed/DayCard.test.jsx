// Render pins for the multi-caregiver DayCard (E13 PR2): a slide per author, per-slide attribution, the
// "N caregivers" header when multiple authors, and day-card-level paw/bark totals. i18n via the real
// English catalog.

import React from "react";
import { render } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());

import { DayCard } from "./DayCard";

const twoAuthorCard = {
  pet: { id: 1, name: "Rex", avatar_url: "rex.png" },
  author_count: 2,
  paw_count: 5,
  bark_count: 2,
  latest_contribution_at: "2026-08-13T10:00:00Z",
  slides: [
    { post_id: 10, image_url: "a.png", caption: "morning walk", author: { id: 1, username: "tats" } },
    { post_id: 11, image_url: "b.png", caption: "evening nap", author: { id: 2, username: "sofia" } },
  ],
};

test("renders one slide per author with the multi-caregiver header", () => {
  const { getByTestId } = render(<DayCard dayCard={twoAuthorCard} />);
  expect(getByTestId("day-card")).toBeTruthy();
  expect(getByTestId("day-card-slide-10")).toBeTruthy();
  expect(getByTestId("day-card-slide-11")).toBeTruthy();
  expect(getByTestId("day-card-authors")).toHaveTextContent("2 caregivers shared today 🐾");
});

test("attributes the active slide to its author and shows day-card paw total", () => {
  const { getByTestId, getByText } = render(<DayCard dayCard={twoAuthorCard} />);
  expect(getByTestId("day-card-author")).toHaveTextContent("Posted by tats");
  expect(getByText("5")).toBeTruthy(); // paw total
});

test("a single-author day renders no multi-caregiver header", () => {
  const solo = {
    pet: { id: 1, name: "Rex" },
    author_count: 1,
    paw_count: 0,
    bark_count: 0,
    slides: [{ post_id: 10, image_url: "a.png", author: { id: 1, username: "tats" } }],
  };
  const { queryByTestId } = render(<DayCard dayCard={solo} />);
  expect(queryByTestId("day-card-authors")).toBeNull();
});

test("an empty day renders nothing", () => {
  const { queryByTestId } = render(<DayCard dayCard={{ slides: [] }} />);
  expect(queryByTestId("day-card")).toBeNull();
});

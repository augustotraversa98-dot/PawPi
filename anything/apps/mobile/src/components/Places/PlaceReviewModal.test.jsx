// PlaceReviewModal: the two-dimension composer. Submit is gated until a rating (≥1) AND a welcome
// tier are chosen; on submit it POSTs the exact body (overall_rating + pet_welcome_level + the
// multi-selected amenities + place_name/category). The submit hook + i18n + icons are mocked;
// i18n resolves REAL en.json.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockMutate;

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("@/hooks/usePlaceReviews", () => ({
  useSubmitPlaceReview: () => ({ mutate: mockMutate, isPending: false }),
}));

import PlaceReviewModal from "./PlaceReviewModal";

const PLACE = { id: "curated-x", name: "Cafe X", category: "cafe" };

beforeEach(() => {
  mockMutate = jest.fn();
});

function renderModal(props = {}) {
  return render(
    <PlaceReviewModal visible place={PLACE} onClose={jest.fn()} {...props} />,
  );
}

test("submit is gated: no-op until a rating AND a welcome tier are chosen", () => {
  const { getByTestId } = renderModal();

  // Nothing chosen → pressing submit does not fire the mutation.
  fireEvent.press(getByTestId("place-review-submit"));
  expect(mockMutate).not.toHaveBeenCalled();

  // Rating only → still gated (tier missing).
  fireEvent.press(getByTestId("place-star-4"));
  fireEvent.press(getByTestId("place-review-submit"));
  expect(mockMutate).not.toHaveBeenCalled();

  // Add a welcome tier → now it submits.
  fireEvent.press(getByTestId("place-welcome-very_welcoming"));
  fireEvent.press(getByTestId("place-review-submit"));
  expect(mockMutate).toHaveBeenCalledTimes(1);
});

test("posts the correct two-dimension payload including amenities", () => {
  const { getByTestId } = renderModal();

  fireEvent.press(getByTestId("place-star-5"));
  fireEvent.press(getByTestId("place-welcome-royalty"));
  fireEvent.press(getByTestId("place-amenity-water_bowls"));
  fireEvent.press(getByTestId("place-amenity-treats"));
  // Toggle one off to prove multi-select add/remove works.
  fireEvent.press(getByTestId("place-amenity-treats"));
  fireEvent.changeText(getByTestId("place-review-comment"), "  Great spot  ");

  fireEvent.press(getByTestId("place-review-submit"));

  expect(mockMutate).toHaveBeenCalledTimes(1);
  const body = mockMutate.mock.calls[0][0];
  expect(body).toEqual({
    overall_rating: 5,
    pet_welcome_level: "royalty",
    amenities: ["water_bowls"],
    comment: "Great spot",
    place_name: "Cafe X",
    place_category: "cafe",
  });
});

test("prefills from an existing review", () => {
  const existing = {
    overall_rating: 3,
    pet_welcome_level: "allowed",
    amenities: ["pet_menu"],
    comment: "ok",
  };
  const { getByTestId } = renderModal({ existing });

  // Submitting straight away (already valid from prefill) posts the prefilled values.
  fireEvent.press(getByTestId("place-review-submit"));
  expect(mockMutate).toHaveBeenCalledTimes(1);
  const body = mockMutate.mock.calls[0][0];
  expect(body.overall_rating).toBe(3);
  expect(body.pet_welcome_level).toBe("allowed");
  expect(body.amenities).toEqual(["pet_menu"]);
});

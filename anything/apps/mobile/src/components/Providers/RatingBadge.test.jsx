// RatingBadge (ticket 2.2): shows the aggregate average + count, and a "New" empty
// state when a provider has no reviews (real data only — never a fake star score).

import React from "react";
import { render } from "@testing-library/react-native";

jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);

import RatingBadge from "./RatingBadge";

describe("RatingBadge", () => {
  it("renders the one-decimal average and the count when there are reviews", () => {
    const { getByText } = render(
      <RatingBadge avgRating={4.5} reviewCount={12} />,
    );
    expect(getByText("4.5")).toBeTruthy();
    expect(getByText("(12)")).toBeTruthy();
  });

  it("coerces string aggregates (Postgres numeric comes back as a string)", () => {
    const { getByText } = render(
      <RatingBadge avgRating={"5.0"} reviewCount={"3"} />,
    );
    expect(getByText("5.0")).toBeTruthy();
    expect(getByText("(3)")).toBeTruthy();
  });

  it("shows the New empty state with zero reviews", () => {
    const { getByText, queryByText } = render(
      <RatingBadge avgRating={null} reviewCount={0} />,
    );
    expect(getByText("New")).toBeTruthy();
    expect(queryByText(/\(/)).toBeNull();
  });

  it("treats a null average as New even if a count slips through", () => {
    const { getByText } = render(
      <RatingBadge avgRating={null} reviewCount={5} />,
    );
    expect(getByText("New")).toBeTruthy();
  });
});

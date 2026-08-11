// Business storefront stat row (ticket 2.93): Posts · Paws · Barks · Followers, with real
// counts from the profile payload's `stats` (Paws stays 0 until the 2.94 table exists) and
// Followers from the shared follow query. "Following" is deliberately absent for a business.
import React from "react";
import { render } from "@testing-library/react-native";

let mockFollow;
jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("@/hooks/useProviders", () => ({
  useProviderFollow: () => ({ data: mockFollow }),
}));

import BusinessStatRow from "./BusinessStatRow";

beforeEach(() => {
  mockFollow = { following: false, followersCount: 12 };
});

test("shows Posts/Paws/Barks/Followers with real counts and no Following", () => {
  const { getByText, queryByText } = render(
    <BusinessStatRow
      providerId={1}
      stats={{ postsCount: 4, pawsCount: 0, barksCount: 7 }}
    />,
  );
  // Labels (translated via the i18n test mock → English strings).
  expect(getByText("Posts")).toBeTruthy();
  expect(getByText("Paws")).toBeTruthy();
  expect(getByText("Barks")).toBeTruthy();
  expect(getByText("Followers")).toBeTruthy();
  // A business doesn't follow — no Following stat.
  expect(queryByText("Following")).toBeNull();

  // Real counts. Paws is 0 pre-2.94 (degrades, never crashes).
  expect(getByText("4")).toBeTruthy(); // posts
  expect(getByText("0")).toBeTruthy(); // paws
  expect(getByText("7")).toBeTruthy(); // barks
  expect(getByText("12")).toBeTruthy(); // followers (from the follow query)
});

test("degrades to zeros when stats/follow are missing (never crashes)", () => {
  mockFollow = undefined;
  const { getAllByText } = render(<BusinessStatRow providerId={1} stats={undefined} />);
  // All four render 0.
  expect(getAllByText("0").length).toBe(4);
});

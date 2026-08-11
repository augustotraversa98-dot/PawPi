// Shared social stat strip (pet profile + business storefront). Presentational: renders the
// passed label/value pills, and only pills with an onPress are tappable (testID `stat-<label>`).
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { SocialStatRow } from "./SocialStatRow";

test("renders each stat's value + label", () => {
  const { getByText } = render(
    <SocialStatRow
      stats={[
        { key: "posts", value: 5, label: "Posts" },
        { key: "paws", value: 0, label: "Paws" },
        { key: "barks", value: 3, label: "Barks" },
        { key: "followers", value: 8, label: "Followers" },
      ]}
    />,
  );
  for (const label of ["Posts", "Paws", "Barks", "Followers"]) {
    expect(getByText(label)).toBeTruthy();
  }
  expect(getByText("5")).toBeTruthy();
  expect(getByText("8")).toBeTruthy();
  expect(getByText("0")).toBeTruthy(); // real zero, not hidden
});

test("a stat with onPress is tappable (testID stat-<label>); one without is inert", () => {
  const onPress = jest.fn();
  const { getByTestId, queryByTestId } = render(
    <SocialStatRow
      stats={[
        { key: "posts", value: 5, label: "Posts" },
        { key: "followers", value: 8, label: "Followers", onPress },
      ]}
    />,
  );
  expect(queryByTestId("stat-Posts")).toBeNull(); // no onPress → not interactive
  fireEvent.press(getByTestId("stat-Followers"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

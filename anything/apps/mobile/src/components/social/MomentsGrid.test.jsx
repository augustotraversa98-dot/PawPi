// Shared moments image grid (pet profile + business storefront). Renders one tappable tile per
// moment: an image cover when imageUri is set, else a text tile (body preview). onOpen(moment)
// fires the detail; the empty node shows only when there are no moments and nothing is loading.
import React from "react";
import { Text } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { MomentsGrid } from "./MomentsGrid";

const MOMENTS = [
  { id: 1, imageUri: "https://x/a.jpg", post: { id: 1 }, badge: { icon: null, count: 2 } },
  { id: 2, imageUri: null, body: "text only", post: { id: 2 } },
];

test("renders one tappable tile per moment and opens it", () => {
  const onOpen = jest.fn();
  const { getAllByTestId, getByText } = render(
    <MomentsGrid moments={MOMENTS} onOpen={onOpen} tileTestID="tile" />,
  );
  const tiles = getAllByTestId("tile");
  expect(tiles).toHaveLength(2);
  // Text-only moment shows its body preview (no image).
  expect(getByText("text only")).toBeTruthy();
  fireEvent.press(tiles[0]);
  expect(onOpen).toHaveBeenCalledWith(MOMENTS[0]);
});

test("shows the caller's empty node when there are no moments", () => {
  const { getByText, queryByTestId } = render(
    <MomentsGrid moments={[]} tileTestID="tile" empty={<Text>Nothing here</Text>} />,
  );
  expect(getByText("Nothing here")).toBeTruthy();
  expect(queryByTestId("tile")).toBeNull();
});

test("shows a spinner while the first page loads (no empty node yet)", () => {
  const { queryByText } = render(
    <MomentsGrid moments={[]} isLoading tileTestID="tile" empty={<Text>Nothing here</Text>} />,
  );
  expect(queryByText("Nothing here")).toBeNull();
});

// Ticket 2.36 — the post detail modal shows a delete affordance ONLY for the
// viewer's own post and fires onDelete when tapped.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("lucide-react-native", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return new Proxy(
    {},
    {
      get: (_t, name) => (props) =>
        React.createElement(Text, null, String(name)),
    },
  );
});
jest.mock("@/hooks/useFeedPosts", () => ({
  usePostBarks: () => ({ data: [], isLoading: false }),
}));
jest.mock("@/components/Pets/PetAvatar", () => ({
  PetAvatar: () => null,
}));
// DailyShareButton pulls in react-native-view-shot + expo-sharing; stub it to a
// labelled pressable so we can assert the real share affordance is wired (2.38).
jest.mock("./DailyShareButton", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    DailyShareButton: ({ photoUri }) =>
      React.createElement(Text, { accessibilityLabel: "Share post" }, photoUri || "share"),
  };
});

import { PostDetailModal } from "./PostDetailModal";

const post = {
  id: 5,
  pet_id: 7,
  pet_name: "Rex",
  caption: "hi",
  is_daily_update: true,
  paw_count: 0,
  bark_count: 0,
};

test("renders the real share affordance (2.38) wired to the photo", () => {
  const { getByLabelText } = render(
    <PostDetailModal visible post={{ ...post, image_url: "u.jpg" }} />,
  );
  expect(getByLabelText("Share post")).toBeTruthy();
});

test("shows a real relative timestamp from created_at, not 'Just now' (2.38)", () => {
  const created_at = new Date(Date.now() - 2 * 3600000).toISOString(); // 2h ago
  const { getByText, queryByText } = render(
    <PostDetailModal visible post={{ ...post, created_at }} />,
  );
  expect(getByText(/2h/)).toBeTruthy();
  expect(queryByText("Just now")).toBeNull();
});

test("no delete button when canDelete is false", () => {
  const { queryByLabelText } = render(
    <PostDetailModal visible post={post} canDelete={false} />,
  );
  expect(queryByLabelText("Delete post")).toBeNull();
});

test("shows the delete button and fires onDelete when own post", () => {
  const onDelete = jest.fn();
  const { getByLabelText } = render(
    <PostDetailModal visible post={post} canDelete onDelete={onDelete} />,
  );
  fireEvent.press(getByLabelText("Delete post"));
  expect(onDelete).toHaveBeenCalled();
});

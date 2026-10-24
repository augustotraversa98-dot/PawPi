// Render hygiene (perf audit 5.5, partial): locked cards are memoized rows, so re-rendering the Feed screen
// with unchanged props does not re-render every card, and only the first few cards run the infinite pulse.
import React from "react";
import { render } from "@testing-library/react-native";

const mockRenders = jest.fn();
jest.mock("./PostCard", () => {
  const { View } = require("react-native");
  return {
    PostCard: (props) => {
      mockRenders(props.post.id);
      return <View testID={`card-${props.post.id}`} />;
    },
  };
});
jest.mock("expo-av", () => {
  const { View } = require("react-native");
  return { __esModule: true, Video: () => <View />, ResizeMode: { COVER: "cover" } };
});
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());

import { LockedFeedOverlay } from "./LockedFeedOverlay";

const post = (id) => ({ id, pet_name: `Pet${id}` });

test("re-rendering with the same props does not re-render the locked cards", () => {
  const posts = [post(1), post(2), post(3)];
  const onPostPress = () => {};
  const onOpenProfile = () => {};
  const { rerender } = render(
    <LockedFeedOverlay posts={posts} petName="Rex" onPostPress={onPostPress} onOpenProfile={onOpenProfile} />,
  );
  expect(mockRenders).toHaveBeenCalledTimes(3);
  rerender(
    <LockedFeedOverlay posts={posts} petName="Rex" onPostPress={onPostPress} onOpenProfile={onOpenProfile} />,
  );
  expect(mockRenders).toHaveBeenCalledTimes(3);
});

beforeEach(() => mockRenders.mockClear());

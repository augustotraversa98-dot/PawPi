// A caregiver cannot post a moment. The locked Feed must not ask them to: it says what opens it (night run #4, item 7
// follow-up). EN + ES.
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import i18n from "@/i18n";

jest.mock("@/hooks/useFeedPosts", () => ({
  useTogglePaw: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock("expo-av", () => {
  const { View } = require("react-native");
  return { __esModule: true, Video: (props) => <View testID={props.testID} />, ResizeMode: { COVER: "cover" } };
});

import { LockedFeedOverlay } from "./LockedFeedOverlay";
import { DailyPromptCard } from "./DailyPromptCard";

const post = (id) => ({
  id,
  pet_name: `Pet${id}`,
  pet_handle: `pet${id}`,
  username: "Owner",
  image_url: null,
  locked: true,
});
const WAIT_EN = "Opens as soon as today's moment for Luna is posted.";

beforeEach(() => i18n.changeLanguage("en"));

test("locked cards say what opens the feed and offer no post button", () => {
  const screen = render(
    <LockedFeedOverlay posts={[post(1), post(2)]} petName="Luna" waitingFor="Luna" onPostPress={() => {}} />,
  );
  expect(screen.getAllByText(WAIT_EN)).toHaveLength(2);
  expect(screen.queryByTestId("feed-post-locked-cta")).toBeNull();
});

test("the empty locked feed too", () => {
  const screen = render(<LockedFeedOverlay posts={[]} petName="Luna" waitingFor="Luna" onPostPress={() => {}} />);
  expect(screen.getByText(WAIT_EN)).toBeTruthy();
  expect(screen.queryByText("Post today's photo")).toBeNull();
});

test("someone who can post sees the buttons as before", () => {
  const press = jest.fn();
  const screen = render(<LockedFeedOverlay posts={[post(1)]} petName="Rex" onPostPress={press} />);
  fireEvent.press(screen.getByTestId("feed-post-locked-cta"));
  expect(press).toHaveBeenCalled();
});

test("the daily prompt shows the explanation instead of the post button", () => {
  const screen = render(
    <DailyPromptCard petName="Luna" waitingFor="Luna" hasPostedToday={false} onPostPress={() => {}} />,
  );
  expect(screen.getByTestId("daily-prompt-waiting")).toBeTruthy();
  expect(screen.getByText(WAIT_EN)).toBeTruthy();
});

test("Spanish", async () => {
  await i18n.changeLanguage("es");
  const screen = render(<LockedFeedOverlay posts={[]} petName="Luna" waitingFor="Luna" onPostPress={() => {}} />);
  expect(screen.getByText("Se abre apenas publiquen el momento de hoy de Luna.")).toBeTruthy();
});

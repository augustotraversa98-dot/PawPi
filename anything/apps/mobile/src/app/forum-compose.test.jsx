// Render pins for composing a forum thread (ticket 2.44): title required to submit; submit
// posts title/body/category.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockCreate;

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/hooks/useForum", () => ({
  FORUM_CATEGORIES: ["All", "Health", "Food", "Training", "Behavior", "General"],
  useCreateThread: () => mockCreate,
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      const translations = {
        "forum.composeTitle": "New Discussion",
        "forum.categoryLabel": "Category",
        "forum.titleLabel": "Title",
        "forum.questionPlaceholder": "What's your question?",
        "forum.detailsLabel": "Details (optional)",
        "forum.contextPlaceholder": "Add more context...",
        "forum.postButton": "Post",
      };
      return translations[key] || key;
    },
  }),
}));

import ForumComposeScreen from "./forum-compose";

beforeEach(() => {
  mockCreate = { mutate: jest.fn(), isPending: false };
});

test("submit is a no-op until a title is entered", () => {
  const { getByTestId } = render(<ForumComposeScreen />);
  fireEvent.press(getByTestId("compose-submit"));
  expect(mockCreate.mutate).not.toHaveBeenCalled();
});

test("posts the thread with title/body/category", () => {
  const { getByTestId } = render(<ForumComposeScreen />);
  fireEvent.press(getByTestId("compose-category-Training"));
  fireEvent.changeText(getByTestId("compose-title"), "Leash pulling?");
  fireEvent.changeText(getByTestId("compose-body"), "Any tips");
  fireEvent.press(getByTestId("compose-submit"));
  expect(mockCreate.mutate).toHaveBeenCalledTimes(1);
  expect(mockCreate.mutate.mock.calls[0][0]).toMatchObject({
    title: "Leash pulling?",
    body: "Any tips",
    category: "Training",
  });
});

// Provider-post DETAIL (ticket 2.93): tapping a Posts-grid tile opens this screen, which shows
// the post's full-size images + the comment flow, and now carries the Report/Block menu (moved
// off the grid tiles). The menu shows on another author's post and hides on your own.
import React from "react";
import { render } from "@testing-library/react-native";

let mockParams;
let mockAuth;
let moderationProps;

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/utils/auth/useAuth", () => ({
  useAuth: () => mockAuth,
}));
jest.mock("@/hooks/useUserProfile", () => ({
  useMyProfileId: () => ({ data: 7 }),
}));
jest.mock("@/hooks/useProviderPostComments", () => ({
  useProviderPostComments: () => ({ data: [], isLoading: false }),
  useAddProviderPostComment: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteProviderPostComment: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock("@/components/moderation/ModerationMenu", () => {
  const { Text } = require("react-native");
  return {
    ModerationMenu: (props) => {
      moderationProps = props;
      return props.isOwn ? null : <Text>MOD_MENU</Text>;
    },
  };
});

import ProviderPostScreen from "./provider-post";
import {
  stashProviderPost,
  __clearProviderPostHandoff,
} from "@/utils/providerPostHandoff";

const IMAGES = ["https://x/1.jpg", "https://x/2.jpg"];

beforeEach(() => {
  __clearProviderPostHandoff();
  moderationProps = undefined;
  mockAuth = { isAuthenticated: true, signIn: jest.fn() };
  mockParams = { providerId: "42", postId: "9" };
});

test("renders the post images and a Report/Block menu on another author's post", () => {
  stashProviderPost("42", "9", {
    id: 9,
    body: "Grand opening!",
    image_urls: IMAGES,
    author_user_id: 99,
    is_own: false,
  });
  const { getByText, UNSAFE_getAllByType } = render(<ProviderPostScreen />);
  const { Image } = require("react-native");
  expect(getByText("Grand opening!")).toBeTruthy();
  expect(UNSAFE_getAllByType(Image)).toHaveLength(IMAGES.length);
  // Moderation moved here from the grid; present for a non-own post, wired to provider_post.
  expect(getByText("MOD_MENU")).toBeTruthy();
  expect(moderationProps).toMatchObject({
    targetType: "provider_post",
    targetId: 9,
    isOwn: false,
  });
});

test("hides the moderation menu on the author's own post", () => {
  stashProviderPost("42", "9", {
    id: 9,
    body: "Mine",
    image_urls: [],
    author_user_id: 7,
    is_own: true,
  });
  const { queryByText } = render(<ProviderPostScreen />);
  expect(queryByText("MOD_MENU")).toBeNull();
});

test("a guest can read but is prompted to sign in to comment", () => {
  mockAuth = { isAuthenticated: false, signIn: jest.fn() };
  stashProviderPost("42", "9", { id: 9, body: "Public read", image_urls: [] });
  const { getByText, getByTestId } = render(<ProviderPostScreen />);
  expect(getByText("Public read")).toBeTruthy(); // reads fine
  expect(getByTestId("comment-signin")).toBeTruthy(); // gated composer
});

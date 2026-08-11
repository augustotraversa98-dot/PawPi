// Provider-post DETAIL (ticket 2.93): tapping a Posts-grid tile opens this screen, which shows
// the post's full-size images + the comment flow, and now carries the Report/Block menu (moved
// off the grid tiles). The menu shows on another author's post and hides on your own.
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockParams;
let mockAuth;
let moderationProps;
let mockComments;

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
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 3, name: "Mango" } }),
}));
jest.mock("@/hooks/useProviderPostComments", () => ({
  useProviderPostComments: () => ({ data: mockComments, isLoading: false }),
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
  mockComments = [];
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

test("mirrors the pet post detail: business author row (@handle) + full-width image that enlarges on tap", () => {
  stashProviderPost("42", "9", {
    id: 9,
    body: "Grand opening!",
    image_urls: ["https://x/1.jpg"],
    created_at: "2026-08-11T00:00:00Z",
    author_user_id: 99,
    is_own: false,
    business: { name: "Happy Paws", slug: "happy-paws", logo_url: null },
  });
  const { getByText, getAllByText, getByTestId, queryByTestId } = render(<ProviderPostScreen />);

  // Author row shows the business @handle (unique to the author row); the name appears there too.
  expect(getByText("@happy-paws")).toBeTruthy();
  expect(getAllByText("Happy Paws").length).toBeGreaterThanOrEqual(1);
  // Engagement row: comment count (paws stays 0 pre-2.94). The i18n mock resolves the real
  // English catalog, so the plural key renders as "0 comments".
  expect(getByText("0 comments")).toBeTruthy();

  // The image is a tappable full-width tile that opens the enlarger; closed initially.
  expect(queryByTestId("provider-post-image-viewer")).toBeNull();
  fireEvent.press(getByTestId("provider-post-image"));
  expect(getByTestId("provider-post-image-viewer")).toBeTruthy();
});

test("attributes comments to the commenting PET (@handle), falling back to the account for legacy rows", () => {
  mockComments = [
    // Pet-attributed comment (post-migration) → shows the pet @handle, not the account.
    {
      id: 1,
      author_user_id: 50,
      body: "So cute!",
      created_at: "2026-08-11T00:00:00Z",
      author_username: "demo",
      author_name: "Demo Account",
      pet_name: "Mango",
      pet_handle: "mango",
      pet_avatar_url: "https://x/mango.jpg",
    },
    // Legacy / pet-less comment (pet_* null) → falls back to the account handle.
    {
      id: 2,
      author_user_id: 51,
      body: "Nice",
      created_at: "2026-08-11T00:00:00Z",
      author_username: "olduser",
      author_name: "Old User",
    },
  ];
  stashProviderPost("42", "9", { id: 9, body: "Post", image_urls: [] });
  const { getByText, queryByText } = render(<ProviderPostScreen />);
  expect(getByText("@mango")).toBeTruthy(); // pet, not @demo
  expect(queryByText("@demo")).toBeNull();
  expect(getByText("@olduser")).toBeTruthy(); // legacy row → account fallback
});

test("a guest can read but is prompted to sign in to comment", () => {
  mockAuth = { isAuthenticated: false, signIn: jest.fn() };
  stashProviderPost("42", "9", { id: 9, body: "Public read", image_urls: [] });
  const { getByText, getByTestId } = render(<ProviderPostScreen />);
  expect(getByText("Public read")).toBeTruthy(); // reads fine
  expect(getByTestId("comment-signin")).toBeTruthy(); // gated composer
});

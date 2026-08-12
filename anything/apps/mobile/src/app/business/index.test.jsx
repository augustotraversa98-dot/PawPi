// Business home (business mode). Proves the MVP contract:
//   • header shows the active business name; recent moments render and tap through to the shared
//     provider-post detail (via the in-memory handoff + URL-safe params);
//   • "Post a moment" reuses the upload path and calls the provider-posts create with the right
//     providerId and media_type — image AND video (video also uploads a poster);
//   • the multi-provider switcher switches the active provider.
// The provider hooks / upload / composer are mocked so the test drives the screen logic directly.
// (jest.mock factories may only reference `mock`-prefixed module vars, hence the naming.)

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);

// Providers the account is staff of.
const mockProvidersState = { data: [], isLoading: false };
jest.mock("@/hooks/useProviders", () => ({
  useMyProviders: () => mockProvidersState,
}));

// Provider posts list + create.
const mockPostsState = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
const mockCreateMutation = { mutateAsync: jest.fn().mockResolvedValue({ id: 999 }) };
const mockCreate = { boundId: null };
jest.mock("@/hooks/useProviderPosts", () => ({
  useProviderPosts: () => mockPostsState,
  useCreateProviderPost: (id) => {
    mockCreate.boundId = id;
    return mockCreateMutation;
  },
}));

// Shared upload path — return a thumb url for the poster upload, a media url otherwise.
const mockUpload = jest.fn(async ({ reactNativeAsset }) => ({
  url: reactNativeAsset.name.includes("thumb")
    ? "https://cdn/thumb.jpg"
    : "https://cdn/media.bin",
}));
jest.mock("@/utils/useUpload", () => ({ useUpload: () => [mockUpload, { loading: false }] }));

jest.mock("expo-video-thumbnails", () => ({
  getThumbnailAsync: jest.fn().mockResolvedValue({ uri: "file:///poster.jpg" }),
}));

const mockStash = jest.fn();
jest.mock("@/utils/providerPostHandoff", () => ({ stashProviderPost: (...a) => mockStash(...a) }));

// Active-provider store (selector-style zustand mock).
const mockStoreState = { activeProviderId: null, setActiveProviderId: jest.fn() };
jest.mock("@/store/activeProviderStore", () => ({
  __esModule: true,
  default: (selector) => selector(mockStoreState),
}));

// Composer double — exposes buttons to fire onPost with an image or a video payload, and records
// the reuse props the real composer relies on.
const mockComposer = { props: null };
jest.mock("@/components/Feed/PostComposerModal", () => {
  const { Text, TouchableOpacity } = require("react-native");
  return {
    PostComposerModal: (props) => {
      mockComposer.props = props;
      if (!props.visible) return null;
      return (
        <>
          <TouchableOpacity
            testID="mock-post-image"
            onPress={() => props.onPost({ uri: "file:///pic.jpg", caption: "hi", mediaType: "image" })}
          >
            <Text>POST_IMAGE</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="mock-post-video"
            onPress={() => props.onPost({ uri: "file:///clip.mov", caption: "", mediaType: "video" })}
          >
            <Text>POST_VIDEO</Text>
          </TouchableOpacity>
        </>
      );
    },
  };
});

import BusinessHome from "./index";

beforeEach(() => {
  mockPush.mockReset();
  mockStash.mockReset();
  mockUpload.mockClear();
  mockCreateMutation.mutateAsync.mockClear();
  mockStoreState.activeProviderId = null;
  mockStoreState.setActiveProviderId = jest.fn();
  mockProvidersState.data = [];
  mockPostsState.data = [];
  mockPostsState.isError = false;
  mockComposer.props = null;
});

test("renders the active business name and its recent moments; a tile taps to the detail", () => {
  mockProvidersState.data = [{ id: 5, name: "Happy Paws", slug: "happy", logo_url: null }];
  mockPostsState.data = [
    { id: 11, media_type: "image", image_urls: ["https://cdn/a.jpg"], paw_count: 3, comment_count: 2 },
  ];

  const { getByText, getByTestId } = render(<BusinessHome />);
  expect(getByText("Happy Paws")).toBeTruthy();

  fireEvent.press(getByTestId("business-post-11"));
  expect(mockStash).toHaveBeenCalledWith(
    "5",
    "11",
    expect.objectContaining({ business: expect.objectContaining({ name: "Happy Paws" }) }),
  );
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/service/provider-post",
    params: { providerId: "5", postId: "11" },
  });
});

test("'Post a moment' uploads and creates an IMAGE post for the active provider", async () => {
  mockProvidersState.data = [{ id: 5, name: "Happy Paws" }];
  const { getByTestId } = render(<BusinessHome />);

  fireEvent.press(getByTestId("business-post-moment"));
  // The reused composer is targeted at the business: video always allowed, no daily-lucky banner.
  expect(mockComposer.props.allowVideo).toBe(true);
  expect(mockComposer.props.showLuckyBanner).toBe(false);

  fireEvent.press(getByTestId("mock-post-image"));

  await waitFor(() => expect(mockCreateMutation.mutateAsync).toHaveBeenCalled());
  expect(mockCreate.boundId).toBe(5); // create hook bound to the active provider id
  expect(mockCreateMutation.mutateAsync).toHaveBeenCalledWith(
    expect.objectContaining({ image_urls: ["https://cdn/media.bin"] }),
  );
  // An image post carries no video media_type.
  expect(mockCreateMutation.mutateAsync.mock.calls[0][0].media_type).toBeUndefined();
});

test("'Post a moment' uploads media + poster and creates a VIDEO post", async () => {
  mockProvidersState.data = [{ id: 5, name: "Happy Paws" }];
  const { getByTestId } = render(<BusinessHome />);

  fireEvent.press(getByTestId("business-post-moment"));
  fireEvent.press(getByTestId("mock-post-video"));

  await waitFor(() => expect(mockCreateMutation.mutateAsync).toHaveBeenCalled());
  expect(mockCreateMutation.mutateAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      media_type: "video",
      video_url: "https://cdn/media.bin",
      video_thumbnail_url: "https://cdn/thumb.jpg",
    }),
  );
});

test("the multi-provider switcher switches the active provider", () => {
  mockProvidersState.data = [
    { id: 5, name: "Happy Paws" },
    { id: 9, name: "City Vets" },
  ];
  const setSpy = jest.fn();
  mockStoreState.setActiveProviderId = setSpy;

  const { getByTestId } = render(<BusinessHome />);
  fireEvent.press(getByTestId("business-switcher"));
  fireEvent.press(getByTestId("business-provider-9"));
  expect(setSpy).toHaveBeenCalledWith(9);
});

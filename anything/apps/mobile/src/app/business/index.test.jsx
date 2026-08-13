// Business home (business mode). Proves the MVP contract:
//   • header shows the active business name; recent moments render and tap through to the shared
//     provider-post detail (via the in-memory handoff + URL-safe params);
//   • "Post a moment" reuses the upload path and calls the provider-posts create with the right
//     providerId and media_type — image AND video (video also uploads a poster);
//   • the multi-provider switcher switches the active provider.
// The provider hooks / upload / composer are mocked so the test drives the screen logic directly.
// (jest.mock factories may only reference `mock`-prefixed module vars, hence the naming.)

import React from "react";
import { render, fireEvent, waitFor, within } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);

// RefreshableScrollView double — records the refetch prop (an array of the screen's refetch fns)
// and exposes a "pull" affordance that re-runs them all, so the test can prove pull-to-refresh
// reloads the whole Today screen.
const mockRefreshable = { props: null };
jest.mock("@/components/RefreshableScrollView", () => {
  const { ScrollView, Text, TouchableOpacity } = require("react-native");
  return {
    RefreshableScrollView: (props) => {
      mockRefreshable.props = props;
      const { refetch, children, ...rest } = props;
      const pull = () => (Array.isArray(refetch) ? refetch : [refetch]).forEach((fn) => fn && fn());
      return (
        <ScrollView {...rest} testID="refreshable-scroll">
          <TouchableOpacity testID="pull-to-refresh" onPress={pull}>
            <Text>PULL</Text>
          </TouchableOpacity>
          {children}
        </ScrollView>
      );
    },
  };
});

// Providers the account is staff of + the Today-glance reads (bookings/unread/adoption/profile)
// and the follow query BusinessStatRow reads live. useActiveProvider is REAL — it composes the
// mocked useMyProviders + the mocked activeProviderStore below.
const mockProvidersState = { data: [], isLoading: false };
const mockBookingsState = { data: [], refetch: jest.fn() };
const mockUnreadState = { data: 0, refetch: jest.fn() };
const mockAdoptionAppsState = { data: [], refetch: jest.fn() };
const mockProfileState = { data: undefined };
jest.mock("@/hooks/useProviders", () => ({
  useMyProviders: () => mockProvidersState,
  useProviderBookings: () => mockBookingsState,
  useProviderUnreadCount: () => mockUnreadState,
  useProviderAdoptionApplications: () => mockAdoptionAppsState,
  useProviderProfile: () => mockProfileState,
  useProviderFollow: () => ({ data: { following: false, followersCount: 0 } }),
}));

// Freeze "today" for the glance's upcoming filter.
jest.mock("@/utils/canonicalDateTime", () => ({
  toCanonicalDate: () => "2026-08-12",
  formatDisplayTime: (tm) => `T:${tm}`,
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
  mockBookingsState.data = [];
  mockBookingsState.refetch = jest.fn();
  mockUnreadState.data = 0;
  mockUnreadState.refetch = jest.fn();
  mockAdoptionAppsState.data = [];
  mockAdoptionAppsState.refetch = jest.fn();
  mockPostsState.refetch = jest.fn();
  mockRefreshable.props = null;
  mockProfileState.data = undefined;
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

test("Today at a glance summarizes today's bookings + next up and unread messages", () => {
  mockProvidersState.data = [{ id: 5, name: "Happy Paws", slug: "happy" }];
  mockUnreadState.data = 4;
  mockBookingsState.data = [
    // today (2026-08-12) — counted; the earliest is "next up"
    { id: 1, appointment_date: "2026-08-12", appointment_time: "15:00", booking_status: "confirmed", service_name: "Grooming", pet_name: "Rex" },
    { id: 2, appointment_date: "2026-08-12", appointment_time: "09:30", booking_status: "requested", service_name: "Checkup", pet_name: "Milo" },
    // future — not today, not next-up-first
    { id: 3, appointment_date: "2026-08-20", appointment_time: "10:00", booking_status: "confirmed", service_name: "Nails", pet_name: "Zoe" },
    // hidden: declined + past
    { id: 4, appointment_date: "2026-08-12", appointment_time: "08:00", booking_status: "declined", service_name: "X", pet_name: "Q" },
  ];

  const { getByTestId, getByText } = render(<BusinessHome />);
  // 2 active bookings today (Rex 15:00 + Milo 09:30); declined excluded.
  expect(getByText("2")).toBeTruthy();
  expect(getByText("4")).toBeTruthy(); // unread messages
  // Next up is the earliest active booking (Milo 09:30), formatted via the mocked time helper.
  expect(getByText("Next up: T:09:30 · Checkup")).toBeTruthy();
  expect(getByTestId("glance-bookings")).toBeTruthy();
});

test("glance rows + stat row tap through to their tabs", () => {
  mockProvidersState.data = [{ id: 5, name: "Happy Paws", slug: "happy" }];
  const { getByTestId } = render(<BusinessHome />);

  fireEvent.press(getByTestId("business-stat-row"));
  expect(mockPush).toHaveBeenCalledWith("/business/profile");

  fireEvent.press(getByTestId("glance-bookings"));
  expect(mockPush).toHaveBeenCalledWith("/business/bookings");

  fireEvent.press(getByTestId("glance-messages"));
  expect(mockPush).toHaveBeenCalledWith("/business/messages");
});

test("Walks quick action shows for a walker provider and opens the workspace", () => {
  mockProvidersState.data = [
    { id: 5, name: "Paw Walks", slug: "paw", capabilities: ["walker"] },
  ];
  const { getByTestId } = render(<BusinessHome />);
  fireEvent.press(getByTestId("business-walks-action"));
  expect(mockPush).toHaveBeenCalledWith("/walker-walks");
});

test("Walks quick action is hidden for a non-walker provider", () => {
  mockProvidersState.data = [{ id: 5, name: "City Vets", capabilities: ["vet"] }];
  const { queryByTestId } = render(<BusinessHome />);
  expect(queryByTestId("business-walks-action")).toBeNull();
});

test("the Today scroller is refresh-wired; a pull reloads all of the screen's queries", () => {
  mockProvidersState.data = [{ id: 5, name: "Happy Paws", slug: "happy" }];

  const { getByTestId } = render(<BusinessHome />);
  // The main content scroller is the RefreshableScrollView.
  expect(getByTestId("refreshable-scroll")).toBeTruthy();
  // Pull reloads the whole screen: posts + bookings + unread + adoption applications.
  expect(mockRefreshable.props.refetch).toEqual([
    mockPostsState.refetch,
    mockBookingsState.refetch,
    mockUnreadState.refetch,
    mockAdoptionAppsState.refetch,
  ]);

  fireEvent.press(getByTestId("pull-to-refresh"));
  expect(mockPostsState.refetch).toHaveBeenCalledTimes(1);
  expect(mockBookingsState.refetch).toHaveBeenCalledTimes(1);
  expect(mockUnreadState.refetch).toHaveBeenCalledTimes(1);
  expect(mockAdoptionAppsState.refetch).toHaveBeenCalledTimes(1);
});

test("pending adoption applications summary shows ONLY for an adoption-capable provider", () => {
  // Non-adoption provider: no applications glance row.
  mockProvidersState.data = [{ id: 5, name: "Happy Paws", capabilities: ["vet"] }];
  mockAdoptionAppsState.data = [{ id: 1, status: "submitted" }];
  const first = render(<BusinessHome />);
  expect(first.queryByTestId("glance-applications")).toBeNull();
  first.unmount();

  // Adoption-capable provider: the row shows the pending count (submitted/under_review/pending),
  // excluding decided ones.
  mockProvidersState.data = [{ id: 8, name: "Shelter", capabilities: ["adoption"] }];
  mockAdoptionAppsState.data = [
    { id: 1, status: "submitted" },
    { id: 2, status: "under_review" },
    { id: 3, status: "approved" },
    { id: 4, status: "declined" },
  ];
  const { getByTestId } = render(<BusinessHome />);
  const row = getByTestId("glance-applications");
  expect(row).toBeTruthy();
  expect(within(row).getByText("2")).toBeTruthy();
});

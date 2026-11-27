// Render pins for the Dog Social Profile screen:
//   - the real @handle, owner and the five real stat counts render from the
//     fetched profile (not from fake param defaults);
//   - the follow button shows on another pet but is hidden on your own pet.
// The data hooks are mocked, so this exercises the screen's wiring, not fetch.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

// Per-test fixtures the mocked hooks read from (must be `mock*`-prefixed to be
// referenceable inside the hoisted jest.mock factories).
let mockProfile;
let mockViewer;
let mockParams;
const mockPush = jest.fn();
const mockNavigate = jest.fn();

// Resolve t() against the real English catalog so the assertions below can pin
// the actual copy (the labels moved from hardcoded strings to i18n keys).
jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush, navigate: mockNavigate }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/Pets/PetAvatar", () => ({ PetAvatar: () => null }));
jest.mock("@/components/Health/CareRing", () => ({ CareRing: () => null }));
jest.mock("@/hooks/useCareRing", () => ({ useCareRing: () => ({ data: undefined }) }));
jest.mock("@/components/Feed/ShareCardDeck", () => ({ ShareCardDeck: () => null }));
jest.mock("@/components/More/OwnerMenu", () => {
  const { Text } = require("react-native");
  return { OwnerMenu: () => <Text>OWNER_MENU</Text> };
});
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
// The detail modal reports what the screen lets the viewer do with the open post.
jest.mock("@/components/Feed/PostDetailModal", () => {
  const { Text } = require("react-native");
  return {
    PostDetailModal: ({ visible, canDelete, canEdit }) =>
      visible ? <Text testID="detail-flags">{`del=${canDelete}|edit=${canEdit}`}</Text> : null,
  };
});
let mockMyProfileId;
let mockAuthors;
jest.mock("@/hooks/useUserProfile", () => ({
  useMyProfileId: () => ({ data: mockMyProfileId }),
}));
jest.mock("@/hooks/useMomentAuthors", () => ({
  useMomentAuthors: () => ({ data: mockAuthors }),
}));
jest.mock("@/components/Feed/BarkModal", () => ({ BarkModal: () => null }));
// Friends' streaks (the server decides who qualifies): records which dogs the screen asks about.
let mockFriendStreaks = {};
const mockFriendStreakAsks = jest.fn();
jest.mock("@/hooks/useFriendStreaks", () => ({
  useFriendStreaks: (ids) => {
    mockFriendStreakAsks(ids);
    return { streaks: mockFriendStreaks, refetch: jest.fn() };
  },
}));
jest.mock("@/hooks/useFeedPosts", () => ({
  useTogglePaw: () => ({ mutate: jest.fn() }),
  useUpdatePostCaption: () => ({ mutateAsync: jest.fn() }),
  useDeletePost: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: mockViewer }),
  usePetProfile: () => ({ data: mockViewer ? [mockViewer] : [] }),
}));
let mockProfileError = false;
const mockFollowMutate = jest.fn();
const mockProfileRefetch = jest.fn();
jest.mock("@/hooks/usePetSocialProfile", () => ({
  usePetSocialProfile: () => ({
    data: mockProfile,
    isLoading: false,
    isError: mockProfileError,
    refetch: mockProfileRefetch,
  }),
  useToggleFollow: () => ({ mutate: mockFollowMutate }),
}));
jest.mock("@/hooks/useDMs", () => ({
  useStartDM: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
// The daily-post unlock comes from the SAME hook the Feed uses (useFeedData): its
// owner-level `feedUnlocked` + `handlePost`. Stubbed so the test drives both.
let mockFeedUnlocked = false;
let mockCanPostMoment; // undefined = the hook does not say (older shape): the screen falls back to the active dog's role
const mockHandlePost = jest.fn();
jest.mock("@/hooks/useFeedData", () => ({
  useFeedData: () => ({
    feedUnlocked: mockFeedUnlocked,
    handlePost: mockHandlePost,
    canPostMoment: mockCanPostMoment,
    petName: "Mango",
  }),
}));
jest.mock("@/components/Feed/PostComposerModal", () => {
  const { View, Pressable } = require("react-native");
  return {
    PostComposerModal: ({ visible, onPost }) =>
      visible ? (
        <View testID="composer-open">
          <Pressable testID="composer-submit" onPress={() => onPost({ uri: "file://x.jpg" })} />
        </View>
      ) : null,
  };
});

import PetProfileScreen from "./pet-profile";

beforeEach(() => {
  mockFeedUnlocked = false;
  mockCanPostMoment = undefined;
  mockHandlePost.mockReset();
  mockPush.mockReset();
  mockNavigate.mockReset();
  mockFriendStreaks = {};
  mockFriendStreakAsks.mockReset();
  mockParams = { petId: "7", dogName: "Buddy", ownerName: "Alice" };
  mockProfile = {
    pet: {
      id: 7,
      name: "Rex",
      handle: "rexthedog",
      avatar_url: "",
      breed: "Beagle",
      age_years: 2,
      age_months: 3,
    },
    owner: { full_name: "Bob", username: "bob" },
    stats: {
      totalPosts: 5,
      totalPaws: 12,
      totalBarks: 4,
      followers: 8,
      following: 3,
    },
    isFollowing: false,
    posts: [],
  };
});

test("renders the real handle, owner and the five stat labels from the fetch", () => {
  mockViewer = { id: 4 };
  const { getByText, queryByText } = render(<PetProfileScreen />);

  // Real identity wins over the placeholder params.
  expect(getByText("Rex")).toBeTruthy();
  expect(getByText("@rexthedog")).toBeTruthy();
  expect(getByText("with Bob")).toBeTruthy();
  expect(queryByText("Buddy")).toBeNull();
  expect(queryByText("with Alice")).toBeNull();

  // Five real stat pills.
  expect(getByText("Daily posts")).toBeTruthy();
  expect(getByText("Paws")).toBeTruthy();
  expect(getByText("Barks")).toBeTruthy();
  expect(getByText("Followers")).toBeTruthy();
  expect(getByText("Following")).toBeTruthy();
  expect(getByText("8")).toBeTruthy(); // followers count
});

test("shows the empty state, not fakes, when there are no posts", () => {
  mockViewer = { id: 4 };
  const { getByText } = render(<PetProfileScreen />);
  expect(getByText("No daily posts yet")).toBeTruthy();
});

test("shows the Follow button on another pet's profile", () => {
  mockViewer = { id: 4 }; // viewer 4 ≠ profile pet 7
  const { getByText } = render(<PetProfileScreen />);
  expect(getByText("Follow +")).toBeTruthy();
});

test("a refused follow says why instead of only switching back", () => {
  const alert = jest.spyOn(require("react-native").Alert, "alert").mockImplementation(() => {});
  const { getByText } = render(<PetProfileScreen />);
  fireEvent.press(getByText("Follow +"));
  const [variables, options] = mockFollowMutate.mock.calls.at(-1);
  expect(variables).toEqual(expect.objectContaining({ isFollowing: false }));
  options.onError(Object.assign(new Error("x"), { code: "follow_not_allowed" }));
  expect(alert).toHaveBeenCalledWith(
    "Couldn't update follow",
    expect.stringContaining("owner or family"),
  );
  alert.mockRestore();
});

test("hides the Follow button on your own pet's profile", () => {
  mockViewer = { id: 7 }; // viewer pet === profile pet
  const { queryByText } = render(<PetProfileScreen />);
  expect(queryByText("Follow +")).toBeNull();
  expect(queryByText("Following ✓")).toBeNull();
});

test("hides the Follow button when there is no active pet", () => {
  mockViewer = null;
  const { queryByText } = render(<PetProfileScreen />);
  expect(queryByText("Follow +")).toBeNull();
});

describe("Profile tab — embedded mode (ticket 2.60)", () => {
  test("non-embedded (pushed route) shows a Back button, no owner menu", () => {
    mockViewer = { id: 4 };
    const { getByText, queryByText } = render(<PetProfileScreen />);
    expect(getByText("Back")).toBeTruthy();
    expect(queryByText("OWNER_MENU")).toBeNull();
    expect(getByText("Pet profile")).toBeTruthy();
  });

  test("embedded (Profile tab) shows the ☰ owner menu instead of Back", () => {
    mockViewer = { id: 4 };
    const { getByText, queryByText } = render(<PetProfileScreen embedded />);
    expect(getByText("OWNER_MENU")).toBeTruthy(); // burger/menu present
    expect(queryByText("Back")).toBeNull();
    expect(getByText("Profile")).toBeTruthy();
  });

  test("tapping the Followers / Following counts opens the lists (2.61/2.67)", () => {
    mockViewer = { id: 4 };
    const { getByTestId } = render(<PetProfileScreen />);

    // 2.67: navigates to the ROOT `follows` route via an absolute href string,
    // with a NON-empty petId + the right rel.
    fireEvent.press(getByTestId("stat-Followers"));
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining("/follows?petId=7"),
    );
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining("rel=followers"),
    );

    fireEvent.press(getByTestId("stat-Following"));
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining("rel=following"),
    );
  });

  test("a 0 Followers / Following count is a plain pill, not a dead tap (QA 2026-10-16 bug 06)", () => {
    mockViewer = { id: 4 };
    mockProfile = {
      ...mockProfile,
      stats: { ...mockProfile.stats, followers: 0, following: 0 },
    };
    const { getByText, queryByTestId } = render(<PetProfileScreen />);
    expect(getByText("Followers")).toBeTruthy();
    expect(queryByTestId("stat-Followers")).toBeNull();
    expect(queryByTestId("stat-Following")).toBeNull();
  });

  test("2.67: embedded tap resolves a non-empty petId from the active pet (no param)", () => {
    // Embedded Profile tab: no route param, the viewer's active pet drives it.
    mockParams = {};
    mockViewer = { id: 7 };
    const { getByTestId } = render(<PetProfileScreen embedded />);

    fireEvent.press(getByTestId("stat-Followers"));
    // Never an empty petId — it resolves from the active pet.
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining("/follows?petId=7"),
    );
    const href = mockNavigate.mock.calls[0][0];
    expect(href).not.toContain("petId=&");
  });

  test("2.67: no dead tap while the current pet is loading", () => {
    // Embedded tab, no param, current pet not loaded yet → the counts are not
    // tappable (rendered as plain text), so there's no dead tap / empty nav.
    mockParams = {};
    mockViewer = null;
    const { getByText, queryByTestId } = render(<PetProfileScreen embedded />);
    expect(getByText("Followers")).toBeTruthy(); // count still shows
    expect(queryByTestId("stat-Followers")).toBeNull(); // but not interactive
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test("embedded falls back to the viewer's own pet (no route param)", () => {
    // No petId param; the tab shows the current pet's profile.
    mockParams = {};
    mockViewer = { id: 7 }; // current pet === the fetched profile pet (7)
    const { getByText, queryByText } = render(<PetProfileScreen embedded />);
    // Renders the current pet's social profile…
    expect(getByText("Rex")).toBeTruthy();
    // …and it's your own pet, so no Follow affordance.
    expect(queryByText("Follow +")).toBeNull();
  });
});

// AUDIT_2026-09 A-09: a failed profile fetch must say so and offer Retry, not read as
// "this pet has nothing".
describe("fetch failure", () => {
  afterEach(() => {
    mockProfileError = false;
    mockProfileRefetch.mockClear();
  });

  test("shows an error card with Retry that refetches", () => {
    mockProfile = undefined;
    mockProfileError = true;
    const { getByTestId, getByText } = render(<PetProfileScreen />);
    expect(getByTestId("pet-profile-error")).toBeTruthy();
    fireEvent.press(getByText("Try again"));
    expect(mockProfileRefetch).toHaveBeenCalled();
  });
});

// ── Daily-moments gate ──
// Another owner's Daily moments stay hidden until the viewer posts their own today.
// The API withholds them (momentsLocked, posts: []); the screen renders the lock and a
// CTA to post. The viewer's own pets are never gated.
describe("daily moments gate", () => {
  const MOMENT = {
    id: 10,
    image_url: "http://img/10.png",
    caption: "hi",
    post_date: "2026-06-10",
    paw_count: 5,
  };

  test("viewer has NOT posted today: header + stats + info stay, moments grid is replaced by the lock", () => {
    mockViewer = { id: 4 };
    mockProfile = { ...mockProfile, posts: [], momentsLocked: true };
    const { getByText, getByTestId, queryByText, queryByTestId } = render(<PetProfileScreen />);

    // Header, stats and public info still show.
    expect(getByText("Rex")).toBeTruthy();
    expect(getByText("@rexthedog")).toBeTruthy();
    expect(getByText("Daily posts")).toBeTruthy();
    expect(getByText("Followers")).toBeTruthy();
    expect(getByText("About Rex")).toBeTruthy();
    // The grid is replaced by a friendly locked state with a post CTA…
    expect(getByTestId("pet-profile-moments-locked")).toBeTruthy();
    expect(getByText("Post your moment to see more of Rex")).toBeTruthy();
    expect(getByText("Post today's moment")).toBeTruthy();
    // …and it is NOT the misleading "this pet has no posts" empty state.
    expect(queryByText("No daily posts yet")).toBeNull();
    expect(queryByTestId("pet-profile-moment-tile")).toBeNull();
  });

  test("a pet name ending in an emoji never gets a dangling possessive on the lock card", () => {
    mockViewer = { id: 4 };
    mockProfile = {
      ...mockProfile,
      pet: { ...mockProfile.pet, name: "Lila 💜" },
      posts: [],
      momentsLocked: true,
    };
    const { getByText, queryByText } = render(<PetProfileScreen />);

    // Reads "…see more of Lila 💜" - NOT "…see Lila 💜's".
    expect(getByText("Post your moment to see more of Lila 💜")).toBeTruthy();
    expect(queryByText(/💜['’]s/)).toBeNull();
  });

  test("the lock CTA opens the composer, and posting goes through the Feed's handlePost", () => {
    mockViewer = { id: 4 };
    mockProfile = { ...mockProfile, posts: [], momentsLocked: true };
    const { getByTestId, queryByTestId } = render(<PetProfileScreen />);

    expect(queryByTestId("composer-open")).toBeNull();
    fireEvent.press(getByTestId("pet-profile-moments-locked-cta"));
    expect(getByTestId("composer-open")).toBeTruthy();

    fireEvent.press(getByTestId("composer-submit"));
    expect(mockHandlePost).toHaveBeenCalledWith({ uri: "file://x.jpg" });
  });

  test("a caregiver on their active dog gets the explanation, no composer (unchanged)", () => {
    mockViewer = { id: 4, is_shared: true, access_role: "caregiver" };
    mockProfile = { ...mockProfile, posts: [], momentsLocked: true };
    const alertSpy = jest.spyOn(require("react-native").Alert, "alert").mockImplementation(() => {});
    const { getByTestId, queryByTestId } = render(<PetProfileScreen />);
    fireEvent.press(getByTestId("pet-profile-moments-locked-cta"));
    expect(queryByTestId("composer-open")).toBeNull();
    expect(alertSpy).toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  test("a caregiver who also owns a dog (Feed says it can post, for the own dog): the CTA opens the composer", () => {
    mockViewer = { id: 4, is_shared: true, access_role: "caregiver" };
    mockCanPostMoment = true;
    mockProfile = { ...mockProfile, posts: [], momentsLocked: true };
    const { getByTestId, queryByTestId } = render(<PetProfileScreen />);
    fireEvent.press(getByTestId("pet-profile-moments-locked-cta"));
    expect(getByTestId("composer-open")).toBeTruthy();
  });

  test("viewer HAS posted: the moments grid renders (no lock)", () => {
    mockViewer = { id: 4 };
    mockFeedUnlocked = true;
    mockProfile = { ...mockProfile, posts: [MOMENT], momentsLocked: false };
    const { queryByTestId, queryByText, getAllByTestId } = render(<PetProfileScreen />);
    expect(queryByTestId("pet-profile-moments-locked")).toBeNull();
    expect(queryByText("Post today's moment")).toBeNull();
    expect(getAllByTestId("pet-profile-moment-tile")).toHaveLength(1);
  });

  test("just posted but the cached profile still says locked: no lock flash, no false empty state, refetches", () => {
    mockViewer = { id: 4 };
    mockFeedUnlocked = true; // the Feed's unlock flipped (post-create invalidation)
    mockProfile = { ...mockProfile, posts: [], momentsLocked: true }; // stale cache
    const { queryByTestId, queryByText } = render(<PetProfileScreen />);

    expect(queryByTestId("pet-profile-moments-locked")).toBeNull();
    expect(queryByText("No daily posts yet")).toBeNull();
    expect(mockProfileRefetch).toHaveBeenCalled();
  });

  test("own pet's profile is never gated, even if the viewer has not posted", () => {
    mockViewer = { id: 7 }; // viewer owns the profile pet (7)
    mockFeedUnlocked = false;
    mockProfile = { ...mockProfile, posts: [MOMENT] }; // the server never locks own pets
    const { queryByTestId, getAllByTestId } = render(<PetProfileScreen />);
    expect(queryByTestId("pet-profile-moments-locked")).toBeNull();
    expect(getAllByTestId("pet-profile-moment-tile")).toHaveLength(1);
  });

  test("own pet is never gated even if a stale payload said locked", () => {
    mockViewer = { id: 7 };
    mockProfile = { ...mockProfile, posts: [], momentsLocked: true };
    const { queryByTestId, getByText } = render(<PetProfileScreen />);
    expect(queryByTestId("pet-profile-moments-locked")).toBeNull();
    expect(getByText("No daily posts yet")).toBeTruthy(); // truly empty → real empty state
  });

  test("a truly empty profile (viewer posted, pet has no posts) still shows the real empty state", () => {
    mockViewer = { id: 4 };
    mockFeedUnlocked = true;
    mockProfile = { ...mockProfile, posts: [], momentsLocked: false };
    const { getByText } = render(<PetProfileScreen />);
    expect(getByText("No daily posts yet")).toBeTruthy();
  });
});

// Delete / edit follow the server's rule (the author), also on a dog shared with the viewer (night run #4, item 8).
describe("removing a moment from the dog profile", () => {
  const MOMENT = { id: 10, image_url: "http://img/10.png", caption: "hi", post_date: "2026-06-10", paw_count: 5 };
  const openFirstMoment = ({ dog, me, authors }) => {
    mockViewer = dog;
    mockMyProfileId = me;
    mockAuthors = authors;
    mockProfile = { ...mockProfile, posts: [MOMENT], momentsLocked: false };
    const screen = render(<PetProfileScreen />);
    fireEvent.press(screen.getAllByTestId("pet-profile-moment-tile")[0]);
    return screen.getByTestId("detail-flags").props.children;
  };
  const shared = { id: 7, is_shared: true, access_role: "family" };
  const own = { id: 7, is_shared: false, access_role: "owner" };

  test("a member may remove THEIR OWN moment on a shared dog", () => {
    expect(openFirstMoment({ dog: shared, me: 20, authors: new Map([[MOMENT.id, 20]]) })).toBe(
      "del=true|edit=true",
    );
  });

  test("a member may not remove someone else's", () => {
    expect(openFirstMoment({ dog: shared, me: 20, authors: new Map([[MOMENT.id, 10]]) })).toBe(
      "del=false|edit=false",
    );
  });

  test("while the author is unknown, a shared dog offers nothing", () => {
    expect(openFirstMoment({ dog: shared, me: 20, authors: undefined })).toBe("del=false|edit=false");
  });

  test("the owner removes their own moment, as before", () => {
    expect(openFirstMoment({ dog: own, me: 10, authors: new Map([[MOMENT.id, 10]]) })).toBe(
      "del=true|edit=true",
    );
  });

  test("the owner is not offered a delete the server refuses (a member's moment)", () => {
    expect(openFirstMoment({ dog: own, me: 10, authors: new Map([[MOMENT.id, 20]]) })).toBe(
      "del=false|edit=false",
    );
  });
});

describe("a friend's streak", () => {
  const asked = () => mockFriendStreakAsks.mock.calls.at(-1)[0];

  test("a friend's dog with a live streak shows the flame chip with its number", () => {
    mockViewer = { id: 4 };
    mockFriendStreaks = { 7: 12 };
    const { getByText, getByLabelText } = render(<PetProfileScreen />);
    expect(asked()).toEqual([7]);
    expect(getByText("🔥 12")).toBeTruthy();
    expect(getByLabelText("12 day streak")).toBeTruthy();
  });

  test("nothing extra when the server returns no streak for the dog", () => {
    mockViewer = { id: 4 };
    const { queryByText } = render(<PetProfileScreen />);
    expect(queryByText(/🔥/)).toBeNull();
  });

  test("the viewer's own dog is never asked about", () => {
    mockViewer = { id: 7 };
    render(<PetProfileScreen />);
    expect(asked()).toEqual([]);
  });

  test("opened by handle: asks with the pet's real id, and a shared (household) dog is left out", () => {
    mockViewer = { id: 7, is_shared: true, access_role: "family" };
    mockParams = { petId: "rexthedog" };
    render(<PetProfileScreen />);
    expect(asked()).toEqual([]);
    mockViewer = { id: 4 };
    render(<PetProfileScreen />);
    expect(asked()).toEqual([7]);
  });
});

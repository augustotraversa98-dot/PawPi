import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
// Resolve t() against the real EN catalog so the locked-CTA assertions reflect
// real copy (and a mistyped key fails loudly).
jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
import { PostCard } from "./PostCard";

// useTogglePaw pulls in react-query; stub it so the card renders without a
// QueryClient. A module-level mutateAsync lets the double-tap tests assert the
// paw call (ticket 2.64). The mutation object only needs the shape PostCard reads.
const mockMutateAsync = jest.fn(() => Promise.resolve());
jest.mock("@/hooks/useFeedPosts", () => ({
  useTogglePaw: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

// Drive the a11y prefs so tests can flip Reduce Transparency (solid fallback) and
// Reduce Motion (no pulse). Both default to false = full effect, matching the OS.
let mockReduceTransparency = false;
let mockReduceMotion = false;
jest.mock("@/hooks/useAccessibilityPrefs", () => ({
  useReduceTransparency: () => mockReduceTransparency,
  useReducedMotion: () => mockReduceMotion,
}));

// expo-av's native Video doesn't render under jest-expo — mock it to a View that
// drives play/pause through the ref so the video-post tests can assert playback.
const mockPlayAsync = jest.fn(() => Promise.resolve());
const mockPauseAsync = jest.fn(() => Promise.resolve());
jest.mock("expo-av", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    ResizeMode: { COVER: "cover", CONTAIN: "contain" },
    Video: React.forwardRef((props, ref) => {
      React.useImperativeHandle(ref, () => ({
        playAsync: mockPlayAsync,
        pauseAsync: mockPauseAsync,
      }));
      return React.createElement(View, { testID: props.testID });
    }),
  };
});

beforeEach(() => {
  mockMutateAsync.mockClear();
  mockPlayAsync.mockClear();
  mockPauseAsync.mockClear();
  mockReduceTransparency = false;
  mockReduceMotion = false;
});

const videoPost = {
  id: 2,
  pet_name: "Phoebe",
  username: "Agos",
  pet_avatar: "https://example.com/a.jpg",
  media_type: "video",
  image_url: null,
  video_url: "https://example.com/v.mp4",
  video_thumbnail_url: "https://example.com/thumb.jpg",
  caption: "clip",
};

// Pin "today" so the birthday helper is deterministic (ticket 2.37).
jest.mock("@/utils/dateUtils", () => ({
  ...jest.requireActual("@/utils/dateUtils"),
  getLocalPostDateString: () => "2026-06-18",
}));

const basePost = {
  id: 1,
  pet_name: "Phoebe",
  username: "Agos",
  pet_avatar: "https://example.com/a.jpg",
  image_url: "https://example.com/p.jpg",
  caption: "hi",
};

describe("PostCard — pet @handle line", () => {
  it("renders @handle from pet_handle when present", () => {
    const { getByText, getAllByText } = render(
      <PostCard post={{ ...basePost, pet_handle: "phoebe" }} />,
    );
    expect(getAllByText("Phoebe").length).toBeGreaterThan(0);
    expect(getByText("@phoebe")).toBeTruthy();
    expect(getByText("by Agos")).toBeTruthy();
  });

  it("omits the @handle line when pet_handle is null (no placeholder)", () => {
    const { queryByText } = render(
      <PostCard post={{ ...basePost, pet_handle: null }} />,
    );
    expect(queryByText(/^@/)).toBeNull();
  });

  it("omits the @handle line when pet_handle is an empty string", () => {
    const { queryByText } = render(
      <PostCard post={{ ...basePost, pet_handle: "" }} />,
    );
    expect(queryByText(/^@/)).toBeNull();
  });

  it("tapping the name/@handle header fires onOpenProfile", () => {
    const onOpenProfile = jest.fn();
    const { getByText } = render(
      <PostCard
        post={{ ...basePost, pet_handle: "phoebe" }}
        onOpenProfile={onOpenProfile}
      />,
    );
    // The @handle sits inside the same header tap target as the name.
    fireEvent.press(getByText("@phoebe"));
    expect(onOpenProfile).toHaveBeenCalledTimes(1);
  });
});

describe("PostCard — streak + birthday delight (2.37)", () => {
  it("shows the 🔥 streak badge when streak > 0", () => {
    const { getByText } = render(<PostCard post={basePost} streak={3} />);
    expect(getByText("🔥3")).toBeTruthy();
  });

  it("hides the streak badge when streak is 0 (no fabrication)", () => {
    const { queryByText } = render(<PostCard post={basePost} streak={0} />);
    expect(queryByText(/🔥/)).toBeNull();
  });

  it("shows the 🎂 on a pet's birthday (today, ignoring year)", () => {
    const { getByText } = render(
      <PostCard post={{ ...basePost, pet_birthday: "2020-06-18" }} />,
    );
    expect(getByText("🎂")).toBeTruthy();
  });

  it("shows the 🎂 on the adoption anniversary too", () => {
    const { getByText } = render(
      <PostCard post={{ ...basePost, pet_adoption_date: "2019-06-18" }} />,
    );
    expect(getByText("🎂")).toBeTruthy();
  });

  it("no 🎂 when it's not the pet's day", () => {
    const { queryByText } = render(
      <PostCard post={{ ...basePost, pet_birthday: "2020-01-01" }} />,
    );
    expect(queryByText("🎂")).toBeNull();
  });
});

describe("PostCard — photo/caption tap targets", () => {
  it("single-tapping the photo opens the pet's profile, not the post detail", () => {
    jest.useFakeTimers();
    try {
      const onOpenProfile = jest.fn();
      const onOpenDetail = jest.fn();
      const { getByTestId } = render(
        <PostCard
          post={basePost}
          onOpenProfile={onOpenProfile}
          onOpenDetail={onOpenDetail}
        />,
      );
      fireEvent.press(getByTestId("feed-post-photo"));
      // Single tap is deferred past the double-tap window (ticket 2.64).
      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(onOpenProfile).toHaveBeenCalledTimes(1);
      expect(onOpenDetail).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("tapping the caption still opens the post detail", () => {
    const onOpenProfile = jest.fn();
    const onOpenDetail = jest.fn();
    const { getByTestId } = render(
      <PostCard
        post={basePost}
        onOpenProfile={onOpenProfile}
        onOpenDetail={onOpenDetail}
      />,
    );
    fireEvent.press(getByTestId("feed-post-caption"));
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
    expect(onOpenProfile).not.toHaveBeenCalled();
  });

  it("locked card has no photo tap handler (no profile open)", () => {
    const onOpenProfile = jest.fn();
    const { getByTestId } = render(
      <PostCard post={basePost} locked onOpenProfile={onOpenProfile} />,
    );
    fireEvent.press(getByTestId("feed-post-photo"));
    expect(onOpenProfile).not.toHaveBeenCalled();
  });
});

describe("PostCard — locked variant (BeReal tease, 2.77)", () => {
  it("obscures the caption while locked (identity stays, content hidden)", () => {
    const { getByText, queryByText, getByTestId } = render(
      <PostCard post={{ ...basePost, pet_handle: "phoebe" }} locked />,
    );
    // Identity is fully visible…
    expect(getByText("Phoebe")).toBeTruthy();
    expect(getByText("@phoebe")).toBeTruthy();
    expect(getByText("by Agos")).toBeTruthy();
    // …but the caption text is replaced by an obscured placeholder bar.
    expect(queryByText("hi")).toBeNull();
    expect(getByTestId("feed-post-caption-locked")).toBeTruthy();
  });

  it("tapping a locked photo invokes the composer callback", () => {
    const onLockedPress = jest.fn();
    const onOpenProfile = jest.fn();
    const { getByTestId } = render(
      <PostCard
        post={basePost}
        locked
        onLockedPress={onLockedPress}
        onOpenProfile={onOpenProfile}
      />,
    );
    fireEvent.press(getByTestId("feed-post-photo"));
    expect(onLockedPress).toHaveBeenCalledTimes(1);
    expect(onOpenProfile).not.toHaveBeenCalled();
  });

  it("tapping the locked header invokes the composer callback, not open-profile", () => {
    const onLockedPress = jest.fn();
    const onOpenProfile = jest.fn();
    const { getByText } = render(
      <PostCard
        post={basePost}
        locked
        onLockedPress={onLockedPress}
        onOpenProfile={onOpenProfile}
      />,
    );
    fireEvent.press(getByText("Phoebe"));
    expect(onLockedPress).toHaveBeenCalledTimes(1);
    expect(onOpenProfile).not.toHaveBeenCalled();
  });

  it("shows a name-aware post CTA instead of a paw button while locked", () => {
    const { getByTestId, getByText, queryByText } = render(
      <PostCard post={basePost} locked liked={false} />,
    );
    // No paw button/count on a locked card — it's replaced by the CTA cluster.
    expect(queryByText("0 paws")).toBeNull();
    // A real accessible primary button that invites posting today's moment.
    expect(getByTestId("feed-post-locked-cta")).toBeTruthy();
    expect(getByText("Post today's moment")).toBeTruthy();
    // Name-aware headline + rotating FOMO subline (real name, never fabricated).
    expect(getByText("See Phoebe's day")).toBeTruthy();
    expect(getByText(/Post today's moment to see what Phoebe/)).toBeTruthy();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("tapping the locked CTA button opens the composer", () => {
    const onLockedPress = jest.fn();
    const { getByTestId } = render(
      <PostCard post={basePost} locked onLockedPress={onLockedPress} />,
    );
    fireEvent.press(getByTestId("feed-post-locked-cta"));
    expect(onLockedPress).toHaveBeenCalledTimes(1);
  });

  it("rotates the locked FOMO subline by card position (varied, not one line)", () => {
    const a = render(<PostCard post={basePost} locked lockedCtaIndex={0} />);
    expect(a.getByText(/Post today's moment to see what Phoebe/)).toBeTruthy();
    a.unmount();
    // A different position surfaces a different variant — not one repeated line.
    const b = render(<PostCard post={basePost} locked lockedCtaIndex={1} />);
    expect(b.getByText(/Share your pet's day to unlock Phoebe/)).toBeTruthy();
  });

  it("renders the solid fallback AND the CTA under Reduce Transparency", () => {
    mockReduceTransparency = true;
    const { getByTestId, queryByTestId } = render(
      <PostCard post={basePost} locked />,
    );
    // Blur can't render → near-opaque wash keeps the media obscured…
    expect(getByTestId("feed-post-locked-solid")).toBeTruthy();
    expect(queryByTestId("feed-post-locked-blur")).toBeNull();
    // …and the CTA button still sits legibly on top of it.
    expect(getByTestId("feed-post-locked-cta")).toBeTruthy();
  });
});

describe("PostCard — double-tap to Paw (2.64)", () => {
  it("double-tapping an un-pawed photo paws once and does not open profile", () => {
    const onOpenProfile = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <PostCard post={basePost} liked={false} onOpenProfile={onOpenProfile} />,
    );
    const photo = getByTestId("feed-post-photo");
    fireEvent.press(photo);
    fireEvent.press(photo);

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockMutateAsync).toHaveBeenCalledWith({ isPawed: false });
    expect(onOpenProfile).not.toHaveBeenCalled();
    // The coral paw-pop is shown.
    expect(queryByTestId("paw-pop")).toBeTruthy();
  });

  it("double-tapping an already-pawed photo replays the animation but does NOT paw again", () => {
    const { getByTestId, queryByTestId } = render(
      <PostCard post={basePost} liked onOpenProfile={jest.fn()} />,
    );
    const photo = getByTestId("feed-post-photo");
    fireEvent.press(photo);
    fireEvent.press(photo);

    expect(mockMutateAsync).not.toHaveBeenCalled(); // never un-paws
    expect(queryByTestId("paw-pop")).toBeTruthy();
  });

  it("double-tapping a locked photo does nothing", () => {
    const { getByTestId } = render(
      <PostCard post={basePost} locked liked={false} />,
    );
    const photo = getByTestId("feed-post-photo");
    fireEvent.press(photo);
    fireEvent.press(photo);
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});

describe("PostCard — video posts (daily video moments, step 4)", () => {
  it("an image post renders the photo, never the video player", () => {
    const { getByTestId, queryByTestId } = render(<PostCard post={basePost} />);
    expect(getByTestId("feed-post-photo")).toBeTruthy();
    expect(queryByTestId("feed-post-video")).toBeNull();
  });

  it("unlocked video post renders the inline player (poster + play affordance)", () => {
    const { getByTestId, queryByTestId } = render(<PostCard post={videoPost} />);
    expect(getByTestId("feed-post-video")).toBeTruthy();
    expect(getByTestId("feed-post-video-play")).toBeTruthy();
    // It's a video, not a photo.
    expect(queryByTestId("feed-post-photo")).toBeNull();
  });

  it("single-tapping an unlocked video plays it (deferred past the double-tap window)", async () => {
    jest.useFakeTimers();
    try {
      const { getByTestId } = render(<PostCard post={videoPost} />);
      fireEvent.press(getByTestId("feed-post-video"));
      await act(async () => {
        jest.advanceTimersByTime(300);
      });
      expect(mockPlayAsync).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("double-tapping an unlocked video Paws once and does not play", () => {
    jest.useFakeTimers();
    try {
      const { getByTestId } = render(<PostCard post={videoPost} liked={false} />);
      const target = getByTestId("feed-post-video");
      fireEvent.press(target);
      fireEvent.press(target);
      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
      expect(mockMutateAsync).toHaveBeenCalledWith({ isPawed: false });
      expect(mockPlayAsync).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("locked video blurs the POSTER (not a photo) and never plays", () => {
    const { getByTestId, queryByTestId } = render(
      <PostCard post={videoPost} locked />,
    );
    // No player while locked.
    expect(queryByTestId("feed-post-video")).toBeNull();
    // The blurred locked media is the video thumbnail (expo-image normalizes the
    // source to an array).
    expect(getByTestId("feed-post-locked-media").props.source).toEqual([
      { uri: videoPost.video_thumbnail_url },
    ]);
    expect(getByTestId("feed-post-locked-blur")).toBeTruthy();
    expect(queryByTestId("feed-post-locked-solid")).toBeNull();
  });

  it("locked video with NO thumbnail uses the solid fallback (nothing to blur)", () => {
    const { getByTestId, queryByTestId } = render(
      <PostCard
        post={{ ...videoPost, video_thumbnail_url: null }}
        locked
      />,
    );
    expect(getByTestId("feed-post-locked-solid")).toBeTruthy();
    expect(queryByTestId("feed-post-locked-blur")).toBeNull();
  });

  it("tapping a locked video opens the composer (unchanged lock behavior)", () => {
    const onLockedPress = jest.fn();
    const { getByTestId } = render(
      <PostCard post={videoPost} locked onLockedPress={onLockedPress} />,
    );
    fireEvent.press(getByTestId("feed-post-photo"));
    expect(onLockedPress).toHaveBeenCalledTimes(1);
  });
});

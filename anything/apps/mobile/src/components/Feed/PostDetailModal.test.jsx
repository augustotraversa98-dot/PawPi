// Ticket 2.36 — the post detail modal shows a delete affordance ONLY for the
// viewer's own post and fires onDelete when tapped.

import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";

// A2b: the relative timestamp is now localized via react-i18next. Resolve against the REAL
// English catalog so the "2h" assertion below reflects real EN copy (and a bad key fails loudly).
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());

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
// expo-av's native Video doesn't render under jest-expo — mock it to a View that
// drives play through the ref so the video-post test can assert playback.
const mockPlayAsync = jest.fn(() => Promise.resolve());
jest.mock("expo-av", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    ResizeMode: { COVER: "cover", CONTAIN: "contain" },
    Video: React.forwardRef((props, ref) => {
      React.useImperativeHandle(ref, () => ({
        playAsync: mockPlayAsync,
        pauseAsync: jest.fn(() => Promise.resolve()),
      }));
      return React.createElement(View, { testID: props.testID });
    }),
  };
});
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

beforeEach(() => mockPlayAsync.mockClear());

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

describe("video posts (daily video moments, step 4)", () => {
  const videoPost = {
    ...post,
    media_type: "video",
    image_url: null,
    video_url: "https://example.com/v.mp4",
    video_thumbnail_url: "https://example.com/thumb.jpg",
  };

  it("plays a video post inline (poster + tap-to-play)", async () => {
    jest.useFakeTimers();
    try {
      const { getByTestId, queryByTestId } = render(
        <PostDetailModal visible post={videoPost} />,
      );
      expect(getByTestId("detail-post-video")).toBeTruthy();
      // It's a video, not the image path.
      expect(queryByTestId("detail-post-photo")).toBeNull();
      fireEvent.press(getByTestId("detail-post-video"));
      await act(async () => {
        jest.advanceTimersByTime(300);
      });
      expect(mockPlayAsync).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("an image post still renders the photo, never the video player", () => {
    const { getByTestId, queryByTestId } = render(
      <PostDetailModal visible post={{ ...post, image_url: "u.jpg" }} />,
    );
    expect(getByTestId("detail-post-photo")).toBeTruthy();
    expect(queryByTestId("detail-post-video")).toBeNull();
  });
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

describe("edit own caption (ticket 2.65)", () => {
  it("shows no edit affordance when canEdit is false", () => {
    const { queryByLabelText } = render(
      <PostDetailModal visible post={post} canEdit={false} onSaveCaption={jest.fn()} />,
    );
    expect(queryByLabelText("Edit caption")).toBeNull();
  });

  it("shows no edit affordance without an onSaveCaption handler", () => {
    const { queryByLabelText } = render(
      <PostDetailModal visible post={post} canEdit />,
    );
    expect(queryByLabelText("Edit caption")).toBeNull();
  });

  it("edits the caption: prefilled, saves the new text, updates in place", async () => {
    const onSaveCaption = jest.fn().mockResolvedValue();
    const { getByLabelText, getByTestId, getByText } = render(
      <PostDetailModal visible post={post} canEdit onSaveCaption={onSaveCaption} />,
    );

    fireEvent.press(getByLabelText("Edit caption"));
    const input = getByTestId("edit-caption-input");
    expect(input.props.value).toBe("hi"); // prefilled with current caption
    // Honors the 2.63 keyboard rule — the editor does not auto-focus.
    expect(input.props.autoFocus).not.toBe(true);

    fireEvent.changeText(input, "fixed typo");
    fireEvent.press(getByTestId("save-caption"));

    await waitFor(() =>
      expect(onSaveCaption).toHaveBeenCalledWith("fixed typo"),
    );
    // The modal reflects the new caption immediately.
    await waitFor(() => expect(getByText(/fixed typo/)).toBeTruthy());
  });

  it("cancel discards the edit", () => {
    const onSaveCaption = jest.fn();
    const { getByLabelText, getByTestId, queryByTestId, getByText } = render(
      <PostDetailModal visible post={post} canEdit onSaveCaption={onSaveCaption} />,
    );
    fireEvent.press(getByLabelText("Edit caption"));
    fireEvent.changeText(getByTestId("edit-caption-input"), "nope");
    fireEvent.press(getByTestId("cancel-caption"));
    expect(queryByTestId("edit-caption-input")).toBeNull();
    expect(onSaveCaption).not.toHaveBeenCalled();
    expect(getByText(/\bhi\b/)).toBeTruthy(); // original caption intact
  });
});

// Bug fix: an own post with NO caption gave the owner no discoverable way to ADD
// a caption (only a tiny inline pencil that didn't render with empty text), and
// we re-confirm delete stays reachable regardless of caption.
describe("own post with no caption", () => {
  const noCaption = { ...post, caption: "" };

  it("shows an explicit 'Add a caption' affordance for the owner", () => {
    const { getByLabelText, queryByLabelText } = render(
      <PostDetailModal visible post={noCaption} canEdit onSaveCaption={jest.fn()} />,
    );
    expect(getByLabelText("Add caption")).toBeTruthy();
    // The inline "edit" pencil is for the has-caption case, not this one.
    expect(queryByLabelText("Edit caption")).toBeNull();
  });

  it("'Add a caption' opens the empty editor and saves the new caption", async () => {
    const onSaveCaption = jest.fn().mockResolvedValue();
    const { getByLabelText, getByTestId } = render(
      <PostDetailModal visible post={noCaption} canEdit onSaveCaption={onSaveCaption} />,
    );
    fireEvent.press(getByLabelText("Add caption"));
    const input = getByTestId("edit-caption-input");
    expect(input.props.value).toBe(""); // starts empty (nothing to prefill)

    fireEvent.changeText(input, "first caption");
    fireEvent.press(getByTestId("save-caption"));
    await waitFor(() =>
      expect(onSaveCaption).toHaveBeenCalledWith("first caption"),
    );
  });

  it("does NOT show the add affordance for a non-owner", () => {
    const { queryByLabelText } = render(
      <PostDetailModal visible post={noCaption} canEdit={false} onSaveCaption={jest.fn()} />,
    );
    expect(queryByLabelText("Add caption")).toBeNull();
  });

  it("keeps the owner delete reachable even with no caption", () => {
    const onDelete = jest.fn();
    const { getByLabelText } = render(
      <PostDetailModal visible post={noCaption} canDelete onDelete={onDelete} />,
    );
    fireEvent.press(getByLabelText("Delete post"));
    expect(onDelete).toHaveBeenCalled();
  });
});

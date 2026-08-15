// Render pins for the bark thread's pet identity (PR #70 mobile follow-up):
//   - a bark row shows the commenting pet's @handle (from pet_handle);
//   - a legacy bark (pet_handle / pet_avatar_url null) renders safely, falling
//     back to the owner username and never crashing on the null avatar.
// The data hooks are mocked, so this exercises the row rendering, not fetch.

import React from "react";
import { render } from "@testing-library/react-native";

let mockBarks;

jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/hooks/useFeedPosts", () => ({
  usePostBarks: () => ({ data: mockBarks, isLoading: false, refetch: jest.fn() }),
  useCreateBark: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteBark: () => ({ mutate: jest.fn(), isPending: false }),
}));
// A3: BarkModal reads the caller's own profile id to decide Delete-own vs Report/Block.
let mockMyProfileId = null;
jest.mock("@/hooks/useUserProfile", () => ({
  useMyProfileId: () => ({ data: mockMyProfileId }),
}));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());

import { BarkModal } from "./BarkModal";

const post = { id: 7, pet_name: "Phoebe", caption: "hi" };

afterEach(() => {
  mockBarks = undefined;
  mockMyProfileId = null;
});

describe("BarkModal — keyboard tap-to-focus (ticket 2.63)", () => {
  it("renders the composer WITHOUT auto-focus (keyboard opens only on tap)", () => {
    mockBarks = [];
    const { getByTestId } = render(
      <BarkModal visible post={post} onClose={jest.fn()} />,
    );
    const input = getByTestId("bark-input");
    expect(input).toBeTruthy();
    // The field must not grab focus on open (no autoFocus, no programmatic focus).
    expect(input.props.autoFocus).not.toBe(true);
  });

  it("does not schedule a focus timer when opened", () => {
    jest.useFakeTimers();
    try {
      mockBarks = [];
      render(<BarkModal visible post={post} onClose={jest.fn()} />);
      // The old behavior scheduled setTimeout(() => input.focus()) on open.
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("BarkModal — bark row pet identity", () => {
  it("renders the commenting pet's @handle from pet_handle", () => {
    mockBarks = [
      {
        id: 1,
        text: "good boy",
        created_at: "2026-06-12T00:00:00.000Z",
        username: "alice",
        pet_handle: "rex",
        pet_avatar_url: "https://example.com/rex.jpg",
      },
    ];

    const { getByText, queryByText } = render(
      <BarkModal visible post={post} onClose={jest.fn()} />,
    );

    expect(getByText("@rex")).toBeTruthy();
    // The owner username must NOT leak when a pet handle exists.
    expect(queryByText("alice")).toBeNull();
  });

  it("falls back to the owner username for a legacy null-pet bark without crashing", () => {
    mockBarks = [
      {
        id: 2,
        text: "legacy bark",
        created_at: "2026-06-12T00:00:00.000Z",
        username: "alice",
        pet_handle: null,
        pet_avatar_url: null,
      },
    ];

    const { getByText, queryByText } = render(
      <BarkModal visible post={post} onClose={jest.fn()} />,
    );

    expect(getByText("alice")).toBeTruthy();
    expect(getByText("legacy bark")).toBeTruthy();
    // No fake handle is invented for legacy rows.
    expect(queryByText(/^@/)).toBeNull();
  });
});

describe("BarkModal — comment moderation affordances (A3 / Apple 1.2)", () => {
  const myBark = { id: 1, text: "mine", created_at: "2026-06-12T00:00:00.000Z", user_id: 42, username: "me" };
  const otherBark = { id: 2, text: "theirs", created_at: "2026-06-12T00:00:00.000Z", user_id: 99, username: "them" };

  it("shows Delete on MY OWN comment and NOT the Report/Block menu", () => {
    mockMyProfileId = 42;
    mockBarks = [myBark];
    const { getByLabelText, queryByLabelText } = render(
      <BarkModal visible post={post} onClose={jest.fn()} />,
    );
    expect(getByLabelText("Delete your comment")).toBeTruthy();
    expect(queryByLabelText("More options")).toBeNull();
  });

  it("shows the Report/Block menu on someone else's comment and NOT Delete", () => {
    mockMyProfileId = 42;
    mockBarks = [otherBark];
    const { getByLabelText, queryByLabelText } = render(
      <BarkModal visible post={post} onClose={jest.fn()} />,
    );
    expect(getByLabelText("More options")).toBeTruthy();
    expect(queryByLabelText("Delete your comment")).toBeNull();
  });
});

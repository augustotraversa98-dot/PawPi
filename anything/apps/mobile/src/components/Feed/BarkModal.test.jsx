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
}));

import { BarkModal } from "./BarkModal";

const post = { id: 7, pet_name: "Phoebe", caption: "hi" };

afterEach(() => {
  mockBarks = undefined;
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

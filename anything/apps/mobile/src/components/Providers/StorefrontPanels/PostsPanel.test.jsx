import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

// Regression guard for ticket 2.88: tapping a storefront post card must open the REAL
// `/service/provider-post` detail route with only small, URL-safe params (providerId + postId) —
// NOT a giant `JSON.stringify(post)` blob, which corrupted the deep-link URL and made expo-router
// fall back to the `/service` root ("this screen doesn't exist"). The rich post is handed off in
// memory instead.

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k, o) => (o ? `${k}:${JSON.stringify(o)}` : k) }),
}));

import PostsPanel from "./PostsPanel";
import { getProviderPost, __clearProviderPostHandoff } from "@/utils/providerPostHandoff";

const POST = {
  id: 7,
  body: "Fresh grooming slots this week!",
  // A signed Supabase URL: the `?`/`&`/`%` here are exactly what broke the route param.
  image_urls: ["https://x.supabase.co/storage/v1/object/sign/p/7.jpg?token=ab%2Fcd&expires=99"],
  comment_count: 2,
};

beforeEach(() => {
  mockPush.mockClear();
  __clearProviderPostHandoff();
});

describe("PostsPanel navigation (2.88)", () => {
  it("opens the provider-post detail route with only URL-safe primitives", () => {
    const { getByTestId } = render(<PostsPanel posts={[POST]} providerId={42} />);
    fireEvent.press(getByTestId("storefront-post"));

    expect(mockPush).toHaveBeenCalledTimes(1);
    const arg = mockPush.mock.calls[0][0];
    expect(arg.pathname).toBe("/service/provider-post");
    expect(arg.params).toEqual({ providerId: "42", postId: "7" });
    // Never resolves to the bare /service root, and never re-introduces the fragile JSON blob.
    expect(arg.pathname).not.toBe("/service");
    expect(arg.params.post).toBeUndefined();
  });

  it("hands the rich post (body + images) off in memory for the detail screen", () => {
    const { getByTestId } = render(<PostsPanel posts={[POST]} providerId={42} />);
    fireEvent.press(getByTestId("storefront-post"));

    const handed = getProviderPost("42", "7");
    expect(handed).toEqual(POST);
    expect(handed.image_urls).toHaveLength(1);
  });

  it("does not navigate when providerId is missing (card stays inert, no bad route)", () => {
    const { getByTestId } = render(<PostsPanel posts={[POST]} providerId={undefined} />);
    fireEvent.press(getByTestId("storefront-post"));
    expect(mockPush).not.toHaveBeenCalled();
  });
});

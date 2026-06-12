import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { PostCard } from "./PostCard";

// useTogglePaw pulls in react-query; stub it so the card renders without a
// QueryClient. The mutation object only needs the shape PostCard reads.
jest.mock("@/hooks/useFeedPosts", () => ({
  useTogglePaw: () => ({ mutateAsync: jest.fn(), isPending: false }),
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

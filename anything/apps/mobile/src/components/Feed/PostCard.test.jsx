import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { PostCard } from "./PostCard";

// useTogglePaw pulls in react-query; stub it so the card renders without a
// QueryClient. The mutation object only needs the shape PostCard reads.
jest.mock("@/hooks/useFeedPosts", () => ({
  useTogglePaw: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

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
  it("tapping the photo opens the pet's profile, not the post detail", () => {
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
    expect(onOpenProfile).toHaveBeenCalledTimes(1);
    expect(onOpenDetail).not.toHaveBeenCalled();
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

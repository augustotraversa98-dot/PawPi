import React from "react";
import { render } from "@testing-library/react-native";
import { PetAvatar, getInitials } from "./PetAvatar";

describe("getInitials", () => {
  it("returns two letters from a two-word name", () => {
    expect(getInitials("Max Power")).toBe("MP");
  });
  it("returns up to two letters from a single-word name", () => {
    expect(getInitials("Buddy")).toBe("BU");
  });
  it("uppercases the initials", () => {
    expect(getInitials("rex")).toBe("RE");
  });
  it("returns empty string for a missing/blank name", () => {
    expect(getInitials("")).toBe("");
    expect(getInitials(null)).toBe("");
    expect(getInitials(undefined)).toBe("");
    expect(getInitials("   ")).toBe("");
  });
});

describe("PetAvatar fallback", () => {
  it("shows initials on the brand color when there is a name but no photo", () => {
    const { getByText } = render(<PetAvatar name="Buddy" />);
    expect(getByText("BU")).toBeTruthy();
  });

  it("does not render initials when a photo URL is provided", () => {
    const { queryByText } = render(
      <PetAvatar name="Buddy" uri="https://example.com/dog.jpg" />,
    );
    // With a real photo we render the image, never the initials fallback.
    expect(queryByText("BU")).toBeNull();
  });

  it("renders a neutral glyph (no initials, no crash) when there is no name and no photo", () => {
    const { queryByText } = render(<PetAvatar />);
    expect(queryByText("BU")).toBeNull();
  });

  it("never renders the legacy hardcoded sample name", () => {
    const { queryByText } = render(<PetAvatar name="Buddy" />);
    expect(queryByText(/phoebe/i)).toBeNull();
  });
});

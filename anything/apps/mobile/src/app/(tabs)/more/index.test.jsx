// The bottom-right "Profile" tab (ticket 2.60) is now a thin wrapper that renders
// the pet social profile in `embedded` mode (current-pet fallback + ☰ owner menu).
// The profile behavior is covered by pet-profile.test; the burger menu by
// OwnerMenu.test — here we just pin that the tab delegates with embedded=true.

import React from "react";
import { render } from "@testing-library/react-native";

let lastProps;
jest.mock("@/app/pet-profile", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: (props) => {
      lastProps = props;
      return <Text>PET_PROFILE</Text>;
    },
  };
});

import ProfileTab from "./index";

beforeEach(() => {
  lastProps = undefined;
});

test("the Profile tab renders the pet social profile in embedded mode", () => {
  const { getByText } = render(<ProfileTab />);
  expect(getByText("PET_PROFILE")).toBeTruthy();
  expect(lastProps.embedded).toBe(true);
});

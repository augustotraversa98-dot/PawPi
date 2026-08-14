// BX3: the business-mode settings route renders the SAME shared AppSettings component as the
// pet-owner route — but from inside the business group, so its back arrow returns to the business
// Profile instead of the pet-owner feed. Here we assert the route delegates to AppSettings.

import React from "react";
import { render } from "@testing-library/react-native";

jest.mock("@/components/Settings/AppSettings", () => () => {
  const { Text } = require("react-native");
  return <Text>SHARED_APP_SETTINGS</Text>;
});

import BusinessSettingsScreen from "./settings";

it("renders the shared AppSettings component in the business host", () => {
  const { getByText } = render(<BusinessSettingsScreen />);
  expect(getByText("SHARED_APP_SETTINGS")).toBeTruthy();
});

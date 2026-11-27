// The business card in the feed names the business type in the app's language.

import React from "react";
import { render } from "@testing-library/react-native";

jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock("es"));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("expo-image", () => ({ Image: () => null }));

import { ProviderFeedCard } from "./ProviderFeedCard";

it("shows the business type in Spanish, never the stored id", () => {
  const { getByText, queryByText } = render(
    <ProviderFeedCard provider={{ id: 1, name: "Patitas", provider_type: "daycare" }} />,
  );
  expect(getByText("Guardería")).toBeTruthy();
  expect(queryByText("daycare")).toBeNull();
});

it("leaves the type line out when the business has none", () => {
  const { getByText, queryByText } = render(<ProviderFeedCard provider={{ id: 1, name: "Patitas" }} />);
  expect(getByText("Patitas")).toBeTruthy();
  expect(queryByText("service")).toBeNull();
});

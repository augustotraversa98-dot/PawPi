// BreedPicker localizes its UI strings to Spanish (es-AR) while the breed NAMES
// stay canonical English. Mirrors onboarding.es.test.jsx's proof-of-localization.
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock("es"),
);
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);

import BreedPicker from "./BreedPicker";

describe("BreedPicker (es-AR)", () => {
  test("UI strings are Spanish but breed names stay English", () => {
    const { getByPlaceholderText, getByText, getByTestId } = render(
      <BreedPicker value="" onChange={() => {}} />,
    );
    // Localized chrome.
    expect(getByPlaceholderText("Buscar razas…")).toBeTruthy();
    expect(getByText("Mestizo")).toBeTruthy();
    // Canonical English breed name is NOT translated.
    fireEvent.changeText(getByTestId("breed-search"), "gold");
    expect(getByText("Golden Retriever")).toBeTruthy();
  });

  test("the custom 'Use X' row is localized", () => {
    const { getByTestId, getByText } = render(
      <BreedPicker value="" onChange={() => {}} />,
    );
    fireEvent.changeText(getByTestId("breed-search"), "Cimarron");
    expect(getByText("Usar “Cimarron”")).toBeTruthy();
  });
});

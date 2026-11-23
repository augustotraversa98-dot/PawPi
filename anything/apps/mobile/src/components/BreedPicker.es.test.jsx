// BreedPicker localizes its UI strings AND shows Spanish breed names where one is established
// (es-AR), while the STORED value stays the canonical English name. Search matches both.
// Mirrors onboarding.es.test.jsx's proof-of-localization.
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
  test("UI strings are Spanish; names with no established Spanish name stay international", () => {
    const { getByPlaceholderText, getByText, getByTestId } = render(
      <BreedPicker value="" onChange={() => {}} />,
    );
    // Localized chrome.
    expect(getByPlaceholderText("Buscar razas…")).toBeTruthy();
    expect(getByText("Mestizo")).toBeTruthy();
    // Same name in Spanish (no distinct translation) shows as-is.
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

  test("shows Spanish breed names in the default list but persists the English value", () => {
    const onChange = jest.fn();
    const { getByText, getByTestId, queryByText } = render(
      <BreedPicker value="" onChange={onChange} />,
    );
    expect(getByText("Pastor Alemán")).toBeTruthy();
    expect(getByText("Caniche")).toBeTruthy();
    expect(getByText("Bulldog Francés")).toBeTruthy();
    expect(queryByText("German Shepherd Dog")).toBeNull();
    // The row's testID is the canonical English value and tapping stores it.
    fireEvent.press(getByTestId("breed-option-German Shepherd Dog"));
    expect(onChange).toHaveBeenCalledWith("German Shepherd Dog");
  });

  test("search matches the Spanish name (accent-insensitive) and the English name", () => {
    const { getByTestId, getByText } = render(
      <BreedPicker value="" onChange={() => {}} />,
    );
    fireEvent.changeText(getByTestId("breed-search"), "dalmata");
    expect(getByText("Dálmata")).toBeTruthy();
    fireEvent.changeText(getByTestId("breed-search"), "dalmatian");
    expect(getByText("Dálmata")).toBeTruthy();
    fireEvent.changeText(getByTestId("breed-search"), "agua portugues");
    expect(getByText("Perro de Agua Portugués")).toBeTruthy();
  });

  test("typing an existing Spanish name offers no 'Usar' custom row", () => {
    const { getByTestId, queryByTestId } = render(
      <BreedPicker value="" onChange={() => {}} />,
    );
    fireEvent.changeText(getByTestId("breed-search"), "Pastor Alemán");
    expect(queryByTestId("breed-option-custom")).toBeNull();
  });

  test("an edit screen seeds the search box with the Spanish name of the stored English value", () => {
    const { getByTestId } = render(
      <BreedPicker value="French Bulldog" onChange={() => {}} />,
    );
    expect(getByTestId("breed-search").props.value).toBe("Bulldog Francés");
  });
});

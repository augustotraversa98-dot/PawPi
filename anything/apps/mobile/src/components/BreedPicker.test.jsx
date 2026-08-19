// BreedPicker behaviour (English catalog): search filtering, selecting a
// canonical breed, the pinned Mixed breed option, and the type-your-own "Use X".
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);

import BreedPicker from "./BreedPicker";

describe("BreedPicker", () => {
  test("renders the localized search placeholder + pinned Mixed breed", () => {
    const { getByPlaceholderText, getByTestId } = render(
      <BreedPicker value="" onChange={() => {}} />,
    );
    expect(getByPlaceholderText("Search breeds…")).toBeTruthy();
    expect(getByTestId("breed-option-mixed")).toBeTruthy();
  });

  test("typing 'gold' filters to Golden Retriever AND Golden Doodle", () => {
    const { getByTestId, queryByTestId } = render(
      <BreedPicker value="" onChange={() => {}} />,
    );
    fireEvent.changeText(getByTestId("breed-search"), "gold");
    expect(getByTestId("breed-option-Golden Retriever")).toBeTruthy();
    expect(getByTestId("breed-option-Golden Doodle")).toBeTruthy();
    // An unrelated breed is filtered out.
    expect(queryByTestId("breed-option-Beagle")).toBeNull();
  });

  test("selecting a breed reports the canonical string", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <BreedPicker value="" onChange={onChange} />,
    );
    fireEvent.changeText(getByTestId("breed-search"), "gold");
    fireEvent.press(getByTestId("breed-option-Golden Retriever"));
    expect(onChange).toHaveBeenCalledWith("Golden Retriever");
  });

  test("Mixed breed reports the canonical 'Mixed Breed' value", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <BreedPicker value="" onChange={onChange} />,
    );
    fireEvent.press(getByTestId("breed-option-mixed"));
    expect(onChange).toHaveBeenCalledWith("Mixed Breed");
  });

  test("an off-list query offers a 'Use X' row that saves the typed text", () => {
    const onChange = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <BreedPicker value="" onChange={onChange} />,
    );
    fireEvent.changeText(getByTestId("breed-search"), "Cimarron Uruguayo");
    const custom = getByTestId("breed-option-custom");
    expect(custom).toBeTruthy();
    fireEvent.press(custom);
    expect(onChange).toHaveBeenCalledWith("Cimarron Uruguayo");
    // No spurious custom row once the query exactly matches a canonical breed.
    fireEvent.changeText(getByTestId("breed-search"), "Golden Retriever");
    expect(queryByTestId("breed-option-custom")).toBeNull();
  });

  test("an exact canonical query shows no 'Use X' row", () => {
    const { getByTestId, queryByTestId } = render(
      <BreedPicker value="" onChange={() => {}} />,
    );
    fireEvent.changeText(getByTestId("breed-search"), "beagle");
    expect(getByTestId("breed-option-Beagle")).toBeTruthy();
    expect(queryByTestId("breed-option-custom")).toBeNull();
  });
});

// Roadmap N4 — the Sex/Gender selector never showed the stored value as
// pre-selected because it rendered options as ["Male","Female"] (capitalized)
// while `pets.gender` is stored lowercase (the app-wide convention — see
// profile-edit.jsx / AddDogModal.jsx / onboarding.jsx). Options are now lowercase
// ("male"/"female", capitalized only for display) and the initial value is
// lower-cased on read, so a differently-cased legacy value still matches.

import React from "react";
import { render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("@/components/DateField", () => () => null);

import EditMedicalProfileModal from "./EditMedicalProfileModal";
import { COLORS } from "@/constants/theme";

function isSelected(api, testID) {
  const style = StyleSheet.flatten(api.getByTestId(testID).props.style);
  return style.backgroundColor === COLORS.coral;
}

describe("EditMedicalProfileModal — Sex/Gender selector", () => {
  it("pre-selects the stored (lowercase) gender on open", () => {
    const api = render(
      <EditMedicalProfileModal
        visible
        petId={1}
        initialData={{ pet: { gender: "female" } }}
        onClose={jest.fn()}
      />,
    );
    expect(isSelected(api, "gender-female")).toBe(true);
    expect(isSelected(api, "gender-male")).toBe(false);
  });

  it("still pre-selects correctly when the stored value has legacy capitalization", () => {
    // Simulates a row saved before this fix (this modal used to write "Male"/"Female").
    const api = render(
      <EditMedicalProfileModal
        visible
        petId={1}
        initialData={{ pet: { gender: "Male" } }}
        onClose={jest.fn()}
      />,
    );
    expect(isSelected(api, "gender-male")).toBe(true);
    expect(isSelected(api, "gender-female")).toBe(false);
  });

  it("shows neither option selected when no gender is stored yet", () => {
    const api = render(
      <EditMedicalProfileModal
        visible
        petId={1}
        initialData={{ pet: {} }}
        onClose={jest.fn()}
      />,
    );
    expect(isSelected(api, "gender-male")).toBe(false);
    expect(isSelected(api, "gender-female")).toBe(false);
  });
});

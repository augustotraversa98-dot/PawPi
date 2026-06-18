// Nutrition + food-recall alerts (ticket 2.75):
//   - the non-diagnostic disclaimer is always present;
//   - saving a plan posts the right body (brand/product/form);
//   - a recall alert for the pet renders + dismisses.
// Hooks are mocked.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

let mockPlans;
let mockRecalls;
let mockSave;
let mockDismiss;

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k }) }));
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 5, name: "Rex" } }),
}));
jest.mock("@/hooks/useNutrition", () => ({
  useNutritionPlans: () => mockPlans,
  useSaveNutritionPlan: () => mockSave,
  useRecallMatches: () => mockRecalls,
  useDismissRecall: () => mockDismiss,
}));

import NutritionScreen from "./nutrition";

beforeEach(() => {
  mockPlans = { data: [] };
  mockRecalls = { data: [] };
  mockSave = { mutateAsync: jest.fn().mockResolvedValue({}), isPending: false };
  mockDismiss = { mutate: jest.fn() };
});

it("always shows the non-diagnostic disclaimer", () => {
  const { getByTestId } = render(<NutritionScreen />);
  expect(getByTestId("nutrition-disclaimer")).toBeTruthy();
});

it("saves a plan with the right body", async () => {
  const { getByTestId } = render(<NutritionScreen />);
  fireEvent.changeText(getByTestId("nutrition-brand"), "Acme");
  fireEvent.changeText(getByTestId("nutrition-product"), "Chicken");
  fireEvent.press(getByTestId("nutrition-form-dry"));
  fireEvent.press(getByTestId("nutrition-submit"));
  await waitFor(() =>
    expect(mockSave.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        pet_id: 5,
        food_brand: "Acme",
        food_product: "Chicken",
        food_form: "dry",
      }),
    ),
  );
});

it("renders a recall alert for the pet and dismisses it", () => {
  mockRecalls = {
    data: [
      { id: 3, pet_id: 5, pet_name: "Rex", brand: "Acme", reason: "salmonella", url: "https://r" },
    ],
  };
  const { getByTestId } = render(<NutritionScreen />);
  expect(getByTestId("recall-3")).toBeTruthy();
  fireEvent.press(getByTestId("recall-dismiss-3"));
  expect(mockDismiss.mutate).toHaveBeenCalledWith(3);
});

// Insurance marketplace screen (ticket 2.54): discovery filtered to `insurance`; lists published
// plans; compare view; quote form prefilled from the pet posts a lead with owner-entered fields.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

let mockInsurers;
let mockPlans;
const mockDiscover = jest.fn(() => ({ data: mockInsurers, isLoading: false, isError: false, refetch: jest.fn() }));
const mockSubmit = jest.fn(() => Promise.resolve({ lead: { id: 1 } }));

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 5, name: "Rex", species: "dog", breed: "Beagle", age_years: 3 } }),
}));
jest.mock("@/hooks/useProviders", () => ({ useDiscoverProviders: (...a) => mockDiscover(...a) }));
jest.mock("@/hooks/useInsurance", () => ({
  useInsurancePlans: () => ({ data: mockPlans }),
  useSubmitInsuranceLead: () => ({ mutateAsync: mockSubmit, isPending: false }),
}));

import InsuranceScreen from "./insurance";

beforeEach(() => {
  jest.clearAllMocks();
  mockInsurers = [{ id: 10, name: "PawSure" }];
  mockPlans = [
    { id: 1, name: "Gold", tier: "Premium", monthly_price_min: 20, monthly_price_max: 40, deductible: "$100", reimbursement: "80%", coverage_highlights: ["Accidents", "Illness"] },
    { id: 2, name: "Silver", monthly_price_min: 10, monthly_price_max: 20, coverage_highlights: [] },
  ];
});

test("discovery is filtered to the insurance capability", () => {
  render(<InsuranceScreen />);
  expect(mockDiscover).toHaveBeenCalledWith("insurance");
});

test("selecting an insurer lists its published plans with price range + highlights", () => {
  const { getByTestId, getByText } = render(<InsuranceScreen />);
  fireEvent.press(getByTestId("insurer-10"));
  expect(getByTestId("plan-1")).toBeTruthy();
  expect(getByText(/Gold/)).toBeTruthy();
  expect(getByText("20–40/mo")).toBeTruthy();
  expect(getByText("• Accidents")).toBeTruthy();
});

test("comparing two plans renders the compare view", () => {
  const { getByTestId, queryByTestId } = render(<InsuranceScreen />);
  fireEvent.press(getByTestId("insurer-10"));
  expect(queryByTestId("compare-view")).toBeNull();
  fireEvent.press(getByTestId("compare-1"));
  fireEvent.press(getByTestId("compare-2"));
  expect(getByTestId("compare-view")).toBeTruthy();
});

test("the quote form prefills from the pet and posts a lead", async () => {
  const { getByTestId } = render(<InsuranceScreen />);
  fireEvent.press(getByTestId("insurer-10"));
  fireEvent.press(getByTestId("quote-1"));
  fireEvent.changeText(getByTestId("quote-email"), "me@example.com");
  fireEvent.press(getByTestId("submit-quote"));
  await waitFor(() =>
    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_id: 10,
        plan_id: 1,
        pet_id: 5,
        pet_species: "dog",
        pet_breed: "Beagle",
        pet_age: "3",
        contact_email: "me@example.com",
      }),
    ),
  );
});

test("empty insurers + empty plans show empty states (no fakes)", () => {
  mockInsurers = [];
  const { getByTestId } = render(<InsuranceScreen />);
  expect(getByTestId("insurers-empty")).toBeTruthy();
});

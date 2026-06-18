// Insurance apply / policy hub (ticket 2.72):
//   - the non-underwriting disclaimer is always present;
//   - apply requires accepting terms, then posts the right body (with terms_accepted + plan/provider);
//   - an existing policy renders in the hub with a Pay entry when a premium is set.
// Hooks are mocked.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

let mockParams;
let mockPolicies;
let mockApply;
let mockActivate;

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k }) }));
jest.mock("@/hooks/useInsurance", () => ({
  useInsurancePolicies: () => mockPolicies,
  useApplyPolicy: () => mockApply,
  useActivatePolicy: () => mockActivate,
}));

import InsurancePolicyScreen from "./insurance-policy";

beforeEach(() => {
  mockParams = {
    providerId: "10",
    planId: "100",
    planName: "Gold",
    petId: "5",
    termsUrl: "https://insurer/terms",
    insurerName: "PawSure",
  };
  mockPolicies = { data: [] };
  mockApply = { mutateAsync: jest.fn().mockResolvedValue({}), isPending: false };
  mockActivate = { mutateAsync: jest.fn().mockResolvedValue({}) };
});

it("always shows the non-underwriting disclaimer", () => {
  const { getByTestId } = render(<InsurancePolicyScreen />);
  expect(getByTestId("ins-disclaimer")).toBeTruthy();
});

it("does not apply until terms are accepted", () => {
  const { getByTestId } = render(<InsurancePolicyScreen />);
  fireEvent.press(getByTestId("ins-submit")); // disabled — accepted=false
  expect(mockApply.mutateAsync).not.toHaveBeenCalled();
});

it("applies with the right body after accepting terms", async () => {
  const { getByTestId } = render(<InsurancePolicyScreen />);
  fireEvent.press(getByTestId("ins-accept"));
  fireEvent.press(getByTestId("ins-submit"));
  await waitFor(() =>
    expect(mockApply.mutateAsync).toHaveBeenCalledWith({
      plan_id: 100,
      provider_id: 10,
      pet_id: 5,
      terms_accepted: true,
      terms_url: "https://insurer/terms",
    }),
  );
});

it("renders an existing policy with a Pay entry when a premium is set", () => {
  mockPolicies = {
    data: [
      {
        id: 7,
        provider_id: 10,
        plan_name: "Gold",
        policy_number: "POL-9",
        premium_cents: 5000,
        billing_period: "monthly",
        status: "payment_pending",
      },
    ],
  };
  const { getByTestId } = render(<InsurancePolicyScreen />);
  expect(getByTestId("ins-policy-7")).toBeTruthy();
  expect(getByTestId("ins-pay-7")).toBeTruthy();
});

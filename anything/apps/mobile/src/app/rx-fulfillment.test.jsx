// Rx fulfillment request screen (ticket 2.71):
//   - empty state when no pharmacy providers exist;
//   - pickup request posts the right body (no address);
//   - delivery request posts the map address (2.68 LocationField);
//   - existing orders render with a Pay entry when a price is set.
// Map field, discovery, and fulfillment hooks are mocked.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

let mockParams;
let mockProviders;
let mockOrders;
let mockRequest;

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k }) }));
jest.mock("@/components/Map/LocationField", () => {
  const { Text, TouchableOpacity } = require("react-native");
  return ({ onChange, testID }) => (
    <TouchableOpacity
      testID={testID || "location-field"}
      onPress={() => onChange({ lat: 40.7, lng: -74, address: "123 Main St" })}
    >
      <Text>set address</Text>
    </TouchableOpacity>
  );
});
jest.mock("@/hooks/useProviders", () => ({
  useDiscoverProviders: () => mockProviders,
}));
jest.mock("@/hooks/useRxFulfillment", () => ({
  useRxFulfillmentOrders: () => mockOrders,
  useRequestFulfillment: () => mockRequest,
}));

import RxFulfillmentScreen from "./rx-fulfillment";

beforeEach(() => {
  mockParams = { prescriptionId: "3", petId: "5", drugName: "Amoxicillin" };
  mockProviders = { data: [{ id: 100, name: "Pet Pharmacy" }], isLoading: false };
  mockOrders = { data: [] };
  mockRequest = { mutateAsync: jest.fn().mockResolvedValue({}), isPending: false };
});

it("shows an empty state when there are no pharmacy providers", () => {
  mockProviders = { data: [], isLoading: false };
  const { getByTestId } = render(<RxFulfillmentScreen />);
  expect(getByTestId("rxf-no-providers")).toBeTruthy();
});

it("pickup request posts the right body (no delivery address)", async () => {
  const { getByTestId } = render(<RxFulfillmentScreen />);
  fireEvent.press(getByTestId("rxf-provider-100"));
  fireEvent.press(getByTestId("rxf-method-pickup"));
  fireEvent.press(getByTestId("rxf-submit"));
  await waitFor(() =>
    expect(mockRequest.mutateAsync).toHaveBeenCalledWith({
      prescription_id: 3,
      provider_id: 100,
      method: "pickup",
      delivery_lat: null,
      delivery_lng: null,
      delivery_address: null,
    }),
  );
});

it("delivery request posts the map address", async () => {
  const { getByTestId } = render(<RxFulfillmentScreen />);
  fireEvent.press(getByTestId("rxf-provider-100"));
  // method defaults to delivery; set the address via the mocked LocationField
  fireEvent.press(getByTestId("rxf-location"));
  fireEvent.press(getByTestId("rxf-submit"));
  await waitFor(() =>
    expect(mockRequest.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "delivery",
        delivery_address: "123 Main St",
        delivery_lat: 40.7,
        delivery_lng: -74,
      }),
    ),
  );
});

it("renders an existing order with a Pay entry when priced", () => {
  mockOrders = {
    data: [
      {
        id: 9,
        prescription_id: 3,
        provider_name: "Pet Pharmacy",
        method: "pickup",
        price_cents: 2500,
        status: "ready",
        order_status: null,
      },
    ],
  };
  const { getByTestId } = render(<RxFulfillmentScreen />);
  expect(getByTestId("rxf-order-9")).toBeTruthy();
  expect(getByTestId("rxf-pay-9")).toBeTruthy();
});

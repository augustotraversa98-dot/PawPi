// useStorefrontCart (storefront redesign PR-3a): the cart + checkout logic extracted from
// StorefrontCatalog. Exercised through a tiny harness so we test the hook directly — setQty
// clamp (incl. stock cap), cartLines/total, and onComplete firing on a successful checkout.
// useShopProducts / useShopCheckout are mocked.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Text, TouchableOpacity, Alert, Linking } from "react-native";

let mockProducts;
const mockCheckout = jest.fn();

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("@/hooks/useProviders", () => ({
  useShopProducts: () => ({ data: mockProducts, isLoading: false }),
  useShopCheckout: () => ({ mutateAsync: mockCheckout, isPending: false }),
}));

import { useStorefrontCart } from "./useStorefrontCart";

const PRODUCTS = [
  { id: 1, name: "Kibble", price_cents: 1000, currency: "ARS", stock_qty: 2 },
  { id: 2, name: "Toy", price_cents: 500, currency: "ARS", stock_qty: 9 },
];

// Harness: surfaces the hook's values + a couple of handlers as pressable/inspectable nodes.
function Harness({ shop = { id: 1, name: "Store" }, petId = 7, onComplete }) {
  const cart = useStorefrontCart(shop, petId, { onComplete });
  return (
    <>
      <Text testID="total">{cart.total}</Text>
      <Text testID="lines">{cart.cartLines.length}</Text>
      <TouchableOpacity testID="add1" onPress={() => cart.setQty(1, 1, 2)}>
        <Text>add1</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="add2" onPress={() => cart.setQty(2, 2, 9)}>
        <Text>add2</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="remove1" onPress={() => cart.setQty(1, -5, 2)}>
        <Text>remove1</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="pay" onPress={() => cart.doCheckout()}>
        <Text>pay</Text>
      </TouchableOpacity>
    </>
  );
}

let alertSpy;
let openSpy;
beforeEach(() => {
  mockProducts = PRODUCTS;
  mockCheckout.mockReset();
  mockCheckout.mockResolvedValue({ checkoutUrl: "https://mp/x" });
  // The success path opens MercadoPago + shows an Alert; stub both (as the catalog test does).
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  openSpy = jest.spyOn(Linking, "openURL").mockResolvedValue();
});
afterEach(() => {
  alertSpy.mockRestore();
  openSpy.mockRestore();
});

test("setQty adds a line and totals price × qty", () => {
  const { getByTestId } = render(<Harness />);
  fireEvent.press(getByTestId("add2")); // qty 2 × 500
  expect(getByTestId("lines").props.children).toBe(1);
  expect(getByTestId("total").props.children).toBe(1000);
});

test("setQty clamps at 0 (can't go negative) and at the stock cap", () => {
  const { getByTestId } = render(<Harness />);
  // remove below zero → clamped to 0 (no line).
  fireEvent.press(getByTestId("remove1"));
  expect(getByTestId("lines").props.children).toBe(0);
  // add1 twice would be qty 2 (stock cap 2); a third stays at 2.
  fireEvent.press(getByTestId("add1"));
  fireEvent.press(getByTestId("add1"));
  fireEvent.press(getByTestId("add1"));
  expect(getByTestId("total").props.children).toBe(2000); // 2 × 1000, capped at stock 2
});

test("onComplete fires after a successful checkout (checkoutUrl returned)", async () => {
  const onComplete = jest.fn();
  const { getByTestId } = render(<Harness onComplete={onComplete} />);
  fireEvent.press(getByTestId("add1"));
  fireEvent.press(getByTestId("pay"));
  await waitFor(() => expect(mockCheckout).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  // Money path unchanged: rail mercadopago, pickup default, no address.
  const payload = mockCheckout.mock.calls[0][0];
  expect(payload.rail).toBe("mercadopago");
  expect(payload.fulfillment_type).toBe("pickup");
  expect(payload.shipping_address).toBeNull();
});

test("onComplete does NOT fire when no checkout URL comes back", async () => {
  mockCheckout.mockResolvedValue({ checkoutUrl: null });
  const onComplete = jest.fn();
  const { getByTestId } = render(<Harness onComplete={onComplete} />);
  fireEvent.press(getByTestId("add1"));
  fireEvent.press(getByTestId("pay"));
  await waitFor(() => expect(mockCheckout).toHaveBeenCalledTimes(1));
  expect(onComplete).not.toHaveBeenCalled();
});

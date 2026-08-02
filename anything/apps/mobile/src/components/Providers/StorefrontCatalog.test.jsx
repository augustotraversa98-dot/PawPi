// Shared store storefront (Services Hub P4a): product grid + in-store search + categories +
// favorites + PRODUCT DETAIL (carousel, price, read-more, stock, Rx) + ADD TO CART using the
// existing shop cart. The products hook + checkout hook are mocked; i18n resolves real en.json.
// The cart/checkout LOGIC is unchanged from shop.jsx — here we only cover the browsing UI.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert, Linking } from "react-native";

let mockProducts;
const mockCheckout = jest.fn();

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
jest.mock("@/hooks/useProviders", () => ({
  useShopProducts: () => ({ data: mockProducts, isLoading: false }),
  useShopCheckout: () => ({ mutateAsync: mockCheckout, isPending: false }),
}));

import StorefrontCatalog from "./StorefrontCatalog";

const PRODUCTS = [
  {
    id: 1,
    name: "Kibble",
    price_cents: 500000,
    currency: "ARS",
    stock_qty: 5,
    category: "Food",
    image_urls: ["https://x/k.png"],
    description: "x".repeat(200), // long → read-more
    is_rx: false,
  },
  {
    id: 2,
    name: "Chew Toy",
    price_cents: 150000,
    currency: "ARS",
    stock_qty: 0, // sold out
    category: "Toys",
    image_urls: [],
    description: "Fun",
    is_rx: false,
  },
];

const renderCatalog = () =>
  render(
    <StorefrontCatalog
      shop={{ id: 1, name: "Paws Store" }}
      petId={7}
      onClose={jest.fn()}
    />,
  );

beforeEach(() => {
  mockProducts = PRODUCTS;
  mockCheckout.mockReset();
});

test("renders a product grid card per product", () => {
  const { getByTestId, getByText } = renderCatalog();
  expect(getByTestId("storefront-product-1")).toBeTruthy();
  expect(getByTestId("storefront-product-2")).toBeTruthy();
  expect(getByText("Kibble")).toBeTruthy();
});

test("in-store search filters the grid by name", () => {
  const { getByTestId, queryByTestId } = renderCatalog();
  fireEvent.changeText(getByTestId("storefront-search"), "kibble");
  expect(getByTestId("storefront-product-1")).toBeTruthy();
  expect(queryByTestId("storefront-product-2")).toBeNull();
});

test("category chips filter the grid", () => {
  const { getByTestId, queryByTestId } = renderCatalog();
  fireEvent.press(getByTestId("storefront-cat-Toys"));
  expect(getByTestId("storefront-product-2")).toBeTruthy();
  expect(queryByTestId("storefront-product-1")).toBeNull();
});

test("product detail + add to cart shows the checkout bar", () => {
  const { getByTestId, queryByTestId } = renderCatalog();
  // no cart bar yet
  expect(queryByTestId("storefront-checkout")).toBeNull();
  // open detail
  fireEvent.press(getByTestId("storefront-product-1"));
  expect(getByTestId("storefront-detail-carousel")).toBeTruthy();
  expect(getByTestId("storefront-detail-readmore")).toBeTruthy(); // long description
  // add to cart → checkout bar appears
  fireEvent.press(getByTestId("storefront-detail-add"));
  expect(getByTestId("storefront-checkout")).toBeTruthy();
});

test("read-more toggles the description", () => {
  const { getByTestId, getByText } = renderCatalog();
  fireEvent.press(getByTestId("storefront-product-1"));
  expect(getByText("Read more")).toBeTruthy();
  fireEvent.press(getByTestId("storefront-detail-readmore"));
  expect(getByText("Read less")).toBeTruthy();
});

test("a sold-out product shows no add-to-cart in detail", () => {
  const { getByTestId, queryByTestId, getByText } = renderCatalog();
  fireEvent.press(getByTestId("storefront-product-2"));
  expect(queryByTestId("storefront-detail-add")).toBeNull();
  expect(getByText("Sold out")).toBeTruthy();
});

test("favorite toggle is available on each grid card", () => {
  const { getByTestId } = renderCatalog();
  // Toggling doesn't crash and the control exists (session-local favorite this phase).
  fireEvent.press(getByTestId("storefront-fav-1"));
  expect(getByTestId("storefront-fav-1")).toBeTruthy();
});

test("empty store shows a real empty state (no fakes)", () => {
  mockProducts = [];
  const { getByText } = renderCatalog();
  expect(getByText("This store hasn't listed any products yet.")).toBeTruthy();
});

// Checkout honesty (payments money path): the order is only PENDING until the payment
// webhook confirms it, so the UI must send the buyer to pay and must NEVER claim success
// when no payment window opened.
describe("checkout does not fake a paid order", () => {
  let alertSpy;
  let openSpy;
  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    openSpy = jest.spyOn(Linking, "openURL").mockResolvedValue();
  });
  afterEach(() => {
    alertSpy.mockRestore();
    openSpy.mockRestore();
  });

  const addToCartAndCheckout = () => {
    const utils = renderCatalog();
    fireEvent.press(utils.getByTestId("storefront-product-1"));
    fireEvent.press(utils.getByTestId("storefront-detail-add"));
    fireEvent.press(utils.getByTestId("storefront-checkout"));
    return utils;
  };

  test("with a checkoutUrl → opens MercadoPago and tells the buyer to complete payment", async () => {
    mockCheckout.mockResolvedValue({ checkoutUrl: "https://mp/checkout" });
    addToCartAndCheckout();
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith("https://mp/checkout"));
    expect(alertSpy).toHaveBeenCalledWith(
      "Complete your payment",
      expect.stringContaining("Finish paying in MercadoPago"),
    );
  });

  test("no checkoutUrl → never claims the order was placed, opens nothing", async () => {
    mockCheckout.mockResolvedValue({ checkoutUrl: null });
    addToCartAndCheckout();
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        "Payment couldn't start",
        expect.stringContaining("nothing was charged"),
      ),
    );
    expect(openSpy).not.toHaveBeenCalled();
    // Any "Order placed"/"on its way" copy would be a false success — assert it's absent.
    for (const call of alertSpy.mock.calls) {
      expect(call[0]).not.toMatch(/order placed/i);
    }
  });
});

// StorefrontBrowse (storefront redesign PR-3a): the presentational in-store browse surface —
// search + category chips + product grid — rendered in isolation. Cart/checkout are NOT its
// concern; it just reports taps up via props.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));

import StorefrontBrowse from "./StorefrontBrowse";

const PRODUCTS = [
  { id: 1, name: "Kibble", price_cents: 500000, currency: "ARS", stock_qty: 5, category: "Food", image_urls: [] },
  { id: 2, name: "Chew Toy", price_cents: 150000, currency: "ARS", stock_qty: 3, category: "Toys", image_urls: [] },
];

function renderBrowse(overrides = {}) {
  const props = {
    products: PRODUCTS,
    favorites: new Set(),
    onToggleFavorite: jest.fn(),
    onOpenDetail: jest.fn(),
    cartQtyFor: () => 0,
    onQuickAdd: jest.fn(),
    t: require("@/i18n/testMock").makeReactI18nextMock().useTranslation().t,
    ...overrides,
  };
  return { props, ...render(<StorefrontBrowse {...props} />) };
}

test("shows the search field, category chips, and a card per product", () => {
  const { getByTestId } = renderBrowse();
  expect(getByTestId("storefront-search")).toBeTruthy();
  expect(getByTestId("storefront-cat-all")).toBeTruthy();
  expect(getByTestId("storefront-cat-Food")).toBeTruthy();
  expect(getByTestId("storefront-cat-Toys")).toBeTruthy();
  expect(getByTestId("storefront-product-1")).toBeTruthy();
  expect(getByTestId("storefront-product-2")).toBeTruthy();
});

test("search filters the grid by name", () => {
  const { getByTestId, queryByTestId } = renderBrowse();
  fireEvent.changeText(getByTestId("storefront-search"), "kibble");
  expect(getByTestId("storefront-product-1")).toBeTruthy();
  expect(queryByTestId("storefront-product-2")).toBeNull();
});

test("category chip filters the grid", () => {
  const { getByTestId, queryByTestId } = renderBrowse();
  fireEvent.press(getByTestId("storefront-cat-Toys"));
  expect(getByTestId("storefront-product-2")).toBeTruthy();
  expect(queryByTestId("storefront-product-1")).toBeNull();
});

test("tapping a card opens its detail via onOpenDetail", () => {
  const { getByTestId, props } = renderBrowse();
  fireEvent.press(getByTestId("storefront-product-1"));
  expect(props.onOpenDetail).toHaveBeenCalledWith(1);
});

test("empty product list shows the real empty state", () => {
  const { getByText } = renderBrowse({ products: [] });
  expect(getByText("This store hasn't listed any products yet.")).toBeTruthy();
});

// Merchandising badges (Phase 2a) — the grid card surfaces Featured + Discount only when set.
test("a featured product card shows the Featured badge; a plain one does not", () => {
  const { getByTestId, queryByTestId } = renderBrowse({
    products: [
      { id: 1, name: "Kibble", price_cents: 500000, currency: "ARS", stock_qty: 5, image_urls: [], is_featured: true },
      { id: 2, name: "Chew Toy", price_cents: 150000, currency: "ARS", stock_qty: 3, image_urls: [] },
    ],
  });
  expect(getByTestId("storefront-featured-1")).toBeTruthy();
  expect(queryByTestId("storefront-featured-2")).toBeNull();
});

test("a discounted product card shows the discount badge; a plain one does not", () => {
  const { getByTestId, queryByTestId, getByText } = renderBrowse({
    products: [
      { id: 1, name: "Kibble", price_cents: 80000, compare_at_cents: 100000, currency: "ARS", stock_qty: 5, image_urls: [] },
      { id: 2, name: "Chew Toy", price_cents: 150000, currency: "ARS", stock_qty: 3, image_urls: [] },
    ],
  });
  expect(getByTestId("storefront-discount-1")).toBeTruthy();
  expect(getByText("-20%")).toBeTruthy();
  expect(queryByTestId("storefront-discount-2")).toBeNull();
});

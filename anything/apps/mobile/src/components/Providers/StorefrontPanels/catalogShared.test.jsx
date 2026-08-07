// Unit tests for the storefront merchandising badges (Phase 2a): FeaturedBadge,
// DiscountBadge, and the discountPct math. Rendered in isolation against the REAL English
// catalog so a mistyped i18n key would fail loudly.

import React from "react";
import { render } from "@testing-library/react-native";

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));

import { FeaturedBadge, DiscountBadge, discountPct } from "./catalogShared";

const t = require("@/i18n/testMock").makeReactI18nextMock().useTranslation().t;

describe("discountPct", () => {
  test("rounds (compare_at - price) / compare_at * 100", () => {
    expect(discountPct(80000, 100000)).toBe(20); // 20% off
    expect(discountPct(75000, 100000)).toBe(25);
    expect(discountPct(6667, 10000)).toBe(33); // 33.33 → 33
  });

  test("null when there is no valid discount", () => {
    expect(discountPct(100000, null)).toBeNull();
    expect(discountPct(100000, undefined)).toBeNull();
    expect(discountPct(100000, 100000)).toBeNull(); // equal → not a discount
    expect(discountPct(100000, 90000)).toBeNull(); // "was" below price → invalid
    expect(discountPct(100000, 0)).toBeNull();
  });
});

describe("FeaturedBadge", () => {
  test("renders the Featured label", () => {
    const { getByText } = render(<FeaturedBadge t={t} testID="feat" />);
    expect(getByText("Featured")).toBeTruthy();
  });
});

describe("DiscountBadge", () => {
  test("renders the struck-through was-price and the percent off when discounted", () => {
    const { getByText, getByTestId } = render(
      <DiscountBadge priceCents={80000} compareAtCents={100000} currency="ARS" t={t} testID="disc" />,
    );
    expect(getByTestId("disc")).toBeTruthy();
    expect(getByText("-20%")).toBeTruthy();
  });

  test("renders nothing when compare_at is absent or not a real discount", () => {
    const a = render(<DiscountBadge priceCents={80000} compareAtCents={null} t={t} testID="disc" />);
    expect(a.queryByTestId("disc")).toBeNull();
    const b = render(<DiscountBadge priceCents={80000} compareAtCents={80000} t={t} testID="disc" />);
    expect(b.queryByTestId("disc")).toBeNull();
  });
});

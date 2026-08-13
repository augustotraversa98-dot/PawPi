import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));

import WalkPackagesSection from "./WalkPackagesSection";

const PACKS = [
  { id: 1, walks_count: 1, price_cents: 10000, currency: "ARS" },
  { id: 2, walks_count: 10, price_cents: 90000, currency: "ARS" },
];

describe("WalkPackagesSection", () => {
  it("renders nothing when there are no packages", () => {
    const { toJSON } = render(<WalkPackagesSection packages={[]} onBuy={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });

  it("shows a Buy button per package and calls onBuy with the package", () => {
    const onBuy = jest.fn();
    const { getByTestId } = render(
      <WalkPackagesSection packages={PACKS} remaining={0} onBuy={onBuy} />,
    );
    fireEvent.press(getByTestId("walk-package-buy-2"));
    expect(onBuy).toHaveBeenCalledWith(PACKS[1]);
  });

  it("shows the remaining-balance line only when the owner has walks", () => {
    const { queryByTestId, rerender } = render(
      <WalkPackagesSection packages={PACKS} remaining={0} onBuy={jest.fn()} />,
    );
    expect(queryByTestId("walk-credits-balance")).toBeNull();

    rerender(
      <WalkPackagesSection packages={PACKS} remaining={3} businessName="Paw Walks" onBuy={jest.fn()} />,
    );
    expect(queryByTestId("walk-credits-balance")).toBeTruthy();
  });

  it("disables the Buy buttons while a purchase is in flight", () => {
    const onBuy = jest.fn();
    const { getByTestId } = render(
      <WalkPackagesSection packages={PACKS} remaining={0} onBuy={onBuy} buying />,
    );
    fireEvent.press(getByTestId("walk-package-buy-1"));
    expect(onBuy).not.toHaveBeenCalled(); // disabled
  });
});

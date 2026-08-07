// ServicesPanel (feat/tap-service-to-book): the presentational services list. When
// `onPressService` is provided each row is a tap target that reports the tapped service up;
// without it the rows render non-interactive exactly as before.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));

import ServicesPanel from "./ServicesPanel";

const t = require("@/i18n/testMock").makeReactI18nextMock().useTranslation().t;
const SERVICES = [
  { id: 5, name: "Checkup", price_cents: 5000 },
  { id: 6, name: "Grooming", price_cents: 3000 },
];

test("renders nothing when there are no services", () => {
  const { toJSON } = render(<ServicesPanel services={[]} t={t} />);
  expect(toJSON()).toBeNull();
});

test("tapping a service row calls onPressService with that service", () => {
  const onPressService = jest.fn();
  const { getByTestId } = render(
    <ServicesPanel services={SERVICES} t={t} onPressService={onPressService} />,
  );
  fireEvent.press(getByTestId("service-row-6"));
  expect(onPressService).toHaveBeenCalledTimes(1);
  expect(onPressService).toHaveBeenCalledWith(SERVICES[1]);
});

test("each card shows a Book CTA that opens booking for that service", () => {
  const onPressService = jest.fn();
  const { getByTestId } = render(
    <ServicesPanel services={SERVICES} t={t} onPressService={onPressService} />,
  );
  fireEvent.press(getByTestId("service-book-5"));
  expect(onPressService).toHaveBeenCalledWith(SERVICES[0]);
});

test("without onPressService the rows are non-interactive (no row/book targets)", () => {
  const { queryByTestId, getByText } = render(
    <ServicesPanel services={SERVICES} t={t} />,
  );
  expect(queryByTestId("service-row-5")).toBeNull();
  expect(queryByTestId("service-row-6")).toBeNull();
  expect(queryByTestId("service-book-5")).toBeNull();
  // The content still renders.
  expect(getByText("Checkup")).toBeTruthy();
});

// Prescriptions section (ticket 2.53): owner read-only list with detail + "Prescribed by {clinic}",
// request-refill on an active Rx with refills remaining, pending status, empty state, NO edit.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Alert } from "react-native";

let mockData;
const mockRefill = jest.fn();

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("@/hooks/usePrescriptions", () => ({
  usePrescriptions: () => ({ data: mockData, isLoading: false }),
  useRequestRefill: () => ({ mutate: mockRefill }),
}));

import { PrescriptionsSection } from "./PrescriptionsSection";

beforeEach(() => {
  jest.clearAllMocks();
  mockData = {
    prescriptions: [
      {
        id: 1, drug_name: "Amoxicillin", strength: "250mg", dose: "1 tab", frequency: "BID",
        refills_remaining: 2, status: "active", clinic_name: "Happy Vet", instructions: "With food",
      },
    ],
    refillRequests: [],
  };
});

test("renders the Rx with detail and 'Prescribed by {clinic}'", () => {
  const { getByText } = render(<PrescriptionsSection petId={5} />);
  expect(getByText(/Amoxicillin/)).toBeTruthy();
  expect(getByText("Prescribed by Happy Vet")).toBeTruthy();
  expect(getByText(/With food/)).toBeTruthy();
});

test("empty state when there are no prescriptions (no fakes)", () => {
  mockData = { prescriptions: [], refillRequests: [] };
  const { getByTestId } = render(<PrescriptionsSection petId={5} />);
  expect(getByTestId("rx-empty")).toBeTruthy();
});

test("request-refill posts the prescription id (after confirm)", () => {
  jest.spyOn(Alert, "alert").mockImplementation((t, m, buttons) =>
    buttons.find((b) => b.text === "Request").onPress(),
  );
  const { getByTestId } = render(<PrescriptionsSection petId={5} />);
  fireEvent.press(getByTestId("rx-refill-1"));
  expect(mockRefill).toHaveBeenCalledWith(1, expect.any(Object));
});

test("no refill button when refills are exhausted; pending shows a status", () => {
  mockData.prescriptions[0].refills_remaining = 0;
  const { queryByTestId } = render(<PrescriptionsSection petId={5} />);
  expect(queryByTestId("rx-refill-1")).toBeNull();
});

test("a pending refill shows the awaiting status and hides the button", () => {
  mockData.refillRequests = [{ id: 9, prescription_id: 1, status: "requested" }];
  const { getByTestId, queryByTestId } = render(<PrescriptionsSection petId={5} />);
  expect(getByTestId("rx-pending-1")).toBeTruthy();
  expect(queryByTestId("rx-refill-1")).toBeNull();
});

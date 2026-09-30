import React from "react";
import { Text } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());

import { ErrorBoundary } from "./ErrorBoundary";

// Module-scoped so the same component identity can throw on the boundary's first
// mount, then render cleanly after "Try again" re-mounts it (a caught error tears
// down the whole subtree, so this is the hook a test has into "the underlying
// problem went away").
let shouldThrow = true;
function Bomb() {
  if (shouldThrow) {
    throw new Error("boom");
  }
  return <Text>Recovered</Text>;
}

describe("ErrorBoundary", () => {
  let consoleErrorSpy;

  beforeEach(() => {
    shouldThrow = true;
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders its children when nothing throws", () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Text>All good</Text>
      </ErrorBoundary>,
    );
    expect(getByText("All good")).toBeTruthy();
  });

  it("shows the fallback and logs the error when a child throws", () => {
    const { getByText, queryByText } = render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(queryByText("Recovered")).toBeNull();
    expect(getByText("Something went wrong")).toBeTruthy();
    expect(getByText(/We hit a snag/)).toBeTruthy();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("resets and re-renders the children when Try again is pressed", () => {
    const { getByText, queryByText } = render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(getByText("Something went wrong")).toBeTruthy();

    shouldThrow = false;
    fireEvent.press(getByText("Try again"));

    expect(getByText("Recovered")).toBeTruthy();
    expect(queryByText("Something went wrong")).toBeNull();
  });
});

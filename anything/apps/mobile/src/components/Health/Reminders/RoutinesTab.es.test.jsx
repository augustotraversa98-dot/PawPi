import React from "react";
import { render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Regression: on an es-AR phone the Routines tab header, subtitle and empty state rendered in English
// ("Epsilon's Routines", "Set Epsilon's care schedule…", "No routines yet", "Create First Routine")
// because they were hardcoded JSX literals. They now resolve through t() — and this proves the SPANISH
// catalog is what renders.
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock("es"));
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 7, name: "Epsilon" }, isLoading: false }),
}));
jest.mock("@/hooks/useBottomClearance", () => () => 0);
jest.mock("@/hooks/useSingleFlight", () => (fn) => fn);
jest.mock("@/components/RefreshableScrollView", () => {
  const { ScrollView } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <ScrollView>{children}</ScrollView> };
});
jest.mock("@/telemetry/track", () => ({ trackFunnel: jest.fn(), trackFeature: jest.fn(), trackTap: jest.fn() }));
jest.mock("@/telemetry/useFormTelemetry", () => ({
  useFormTelemetry: () => ({ markComplete: jest.fn(), markError: jest.fn() }),
}));
jest.mock("@/store/routinesStore", () => ({
  __esModule: true,
  default: () => ({
    routines: [],
    addRoutine: jest.fn(),
    updateRoutine: jest.fn(),
    deleteRoutine: jest.fn(),
    toggleRoutineActive: jest.fn(),
    loadRoutines: jest.fn(),
    loading: false,
  }),
}));

import RoutinesTab from "./RoutinesTab";

describe("RoutinesTab (es)", () => {
  it("renders the header, subtitle and empty state in Spanish with the pet name interpolated", () => {
    const { getByText, getAllByText, queryByText } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <RoutinesTab />
      </QueryClientProvider>,
    );
    expect(getByText("Rutinas de Epsilon")).toBeTruthy();
    expect(getAllByText("Configurá el plan de cuidados de Epsilon para que PawPi sepa cuándo recordártelo")).toHaveLength(2);
    expect(getByText("Todavía no hay rutinas")).toBeTruthy();
    expect(getByText("Crear la primera rutina")).toBeTruthy();
    // none of the four reported English strings survive
    expect(queryByText("Epsilon's Routines")).toBeNull();
    expect(queryByText("No routines yet")).toBeNull();
    expect(queryByText("Create First Routine")).toBeNull();
  });
});

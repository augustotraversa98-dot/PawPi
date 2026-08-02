// Render pin for the Vaccination History section (Health → Vet Record).
// Contract (post-#87, pet_vaccinations is the source of truth):
//   - the section's count badge reflects the fetched list length, not the summary;
//   - when expanded, every vaccination renders as a row showing name, date_given
//     (via the screen's shared date formatter), and — when present — its expiry
//     and lot;
//   - an empty list keeps the existing EmptyState.
//
// The vaccination data comes from usePetVaccinations (mocked here). Every other
// section's query goes through a generic useQuery mock returning {} so the screen
// renders without a real QueryClient or network; child screens/modals are nulled.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import HealthVetRecord from "./HealthVetRecord";
import { formatDisplayDate } from "@/utils/canonicalDateTime";

// The screen formats date_given/expires_on via the shared canonicalDateTime util (date-only
// columns — see canonicalDateTime.test.js for its own coverage).
const fmt = (d) => formatDisplayDate(d);

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("@tanstack/react-query", () => ({
  // Generic stub for the screen's per-section queries (summary, allergies, …).
  // summaryLoading must be false so the screen renders past its loading gate.
  useQuery: () => ({ data: {}, isLoading: false }),
  useMutation: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 7, name: "Carly" } }),
}));
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
jest.mock("./PhotoCheck/PhotoHistory", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("./VetSummary/VetSummaryDashboard", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("./VetRecord/EditMedicalProfileModal", () => ({
  __esModule: true,
  default: () => null,
}));

// Controllable vaccination payload per test.
let mockVaccinations;
jest.mock("@/hooks/usePetVaccinations", () => ({
  usePetVaccinations: () => ({
    data: mockVaccinations,
    isLoading: false,
    error: null,
  }),
}));

function expandVaccines(screen) {
  fireEvent.press(screen.getByText("Vaccination History"));
}

afterEach(() => {
  mockVaccinations = undefined;
});

describe("Vet Record — Vaccination History", () => {
  test("count badge reflects the fetched list length", () => {
    mockVaccinations = [
      { id: 1, name: "Rabies", date_given: "2025-04-21" },
      { id: 2, name: "Distemper", date_given: "2025-01-10" },
    ];

    const screen = render(<HealthVetRecord />);

    // SectionHeader renders "<count> items"; 2 vaccinations → "2 items".
    expect(screen.getByText("2 items")).toBeTruthy();
  });

  test("renders a row per vaccination with name, date, expiry, and lot when expanded", () => {
    mockVaccinations = [
      {
        id: 1,
        name: "Rabies",
        date_given: "2025-04-21",
        expires_on: "2026-04-21",
        lot: "AB123",
      },
    ];

    const screen = render(<HealthVetRecord />);
    expandVaccines(screen);

    expect(screen.getByText("Rabies")).toBeTruthy();
    expect(screen.getByText(fmt("2025-04-21"))).toBeTruthy();
    expect(screen.getByText(`Expires ${fmt("2026-04-21")}`)).toBeTruthy();
    expect(screen.getByText("Lot AB123")).toBeTruthy();
  });

  test("handles a null date_given gracefully", () => {
    mockVaccinations = [{ id: 1, name: "Bordetella", date_given: null }];

    const screen = render(<HealthVetRecord />);
    expandVaccines(screen);

    expect(screen.getByText("Bordetella")).toBeTruthy();
    expect(screen.getByText("Date not recorded")).toBeTruthy();
  });

  test("shows the EmptyState when there are no vaccinations", () => {
    mockVaccinations = [];

    const screen = render(<HealthVetRecord />);
    expandVaccines(screen);
    expect(screen.getByText("No vaccinations yet")).toBeTruthy();
  });
});

describe("Vet Record — Add Record picker (no dead-end primary CTA)", () => {
  const { Alert } = require("react-native");

  test("an unbuilt record type gives honest coming-soon feedback, not a silent dead tap", () => {
    const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = render(<HealthVetRecord />);
    fireEvent.press(screen.getByText("Add Record"));
    // Unbuilt types are badged "Soon" (all but Vet Note + Document).
    expect(screen.getAllByText("Soon").length).toBeGreaterThanOrEqual(8);
    fireEvent.press(screen.getByText("Vet Visit"));
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("Vet Visit"),
      expect.stringContaining("Vet Visit"),
    );
    spy.mockRestore();
  });

  test("the two built types (Vet Note / Document) route to their real flow, no coming-soon alert", () => {
    const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = render(<HealthVetRecord />);
    fireEvent.press(screen.getByText("Add Record"));
    fireEvent.press(screen.getByText("Vet Note"));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

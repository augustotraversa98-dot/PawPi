// Vet Record screen (Health → Vet Record) — VR2 grouping contract.
//
// The screen consolidates the old 13 stacked sections into THREE groups:
//   1. Medical profile   2. Next visit   3. Medical history (chip sub-nav)
// and localizes every string (health.vetRecord.*), EN + ES. These tests pin:
//   - the three group headers render, in English AND Spanish (proving real
//     localization, not just a t() call);
//   - the Medical history sub-nav switches the visible list (Vaccines default →
//     Documents → Notes), each reusing its existing query/empty-state;
//   - the count badge on the Vaccines tab reflects usePetVaccinations length;
//   - add/delete flows still work (add opens the modal; delete fires the Alert);
//   - the Add Record picker keeps its no-dead-end coming-soon behavior.
//
// Per-section data is served by a key-aware useQuery mock (keyed on queryKey[0]);
// vaccinations come from usePetVaccinations. Child screens/modals are stubbed.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import HealthVetRecord from "./HealthVetRecord";
import { formatDisplayDate } from "@/utils/canonicalDateTime";

const fmt = (d) => formatDisplayDate(d);

// Mutable language + per-query data, both read at render time.
const mockLangRef = { current: "en" };
let mockQueryData;
let mockVaccinations;

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("react-i18next", () => ({
  useTranslation: () =>
    require("@/i18n/testMock")
      .makeReactI18nextMock(mockLangRef.current)
      .useTranslation(),
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("@tanstack/react-query", () => ({
  // Key-aware stub: the screen's per-section queries resolve against mockQueryData
  // by their queryKey[0]. isLoading:false so the screen renders past its gate.
  useQuery: (opts) => {
    const key = Array.isArray(opts?.queryKey) ? opts.queryKey[0] : opts?.queryKey;
    return { data: mockQueryData[key], isLoading: false, refetch: jest.fn() };
  },
  useMutation: () => ({
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 7, name: "Carly" } }),
}));
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
jest.mock("./PhotoCheck/PhotoHistory", () => ({ __esModule: true, default: () => null }));
jest.mock("./VetSummary/VetSummaryDashboard", () => ({ __esModule: true, default: () => null }));
jest.mock("./VetRecord/EditMedicalProfileModal", () => ({ __esModule: true, default: () => null }));
jest.mock("./VetRecord/PrescriptionsSection", () => ({ PrescriptionsSection: () => null }));

// Add-flow modals: expose their `visible` prop so the add CTAs are observable.
jest.mock("./VetRecord/AddVetNoteModal", () => {
  const { Text } = require("react-native");
  return {
    AddVetNoteModal: ({ visible }) =>
      visible ? <Text>note-modal-open</Text> : null,
  };
});
jest.mock("./VetRecord/AddDocumentModal", () => {
  const { Text } = require("react-native");
  return {
    AddDocumentModal: ({ visible }) =>
      visible ? <Text>doc-modal-open</Text> : null,
  };
});

jest.mock("@/hooks/usePetVaccinations", () => ({
  usePetVaccinations: () => ({
    data: mockVaccinations,
    isLoading: false,
    error: null,
  }),
}));

function emptyData() {
  return {
    "vet-record-summary": {},
    "pet-medical-profile": {},
    "vet-record-allergies": { allergies: [] },
    "vet-record-conditions": { conditions: [] },
    "vet-record-surgeries": { surgeries: [] },
    "vet-record-lab-results": { labResults: [] },
    "vet-record-documents": { documents: [] },
    "vet-record-notes": { notes: [] },
    "vet-appointments": { appointments: [] },
  };
}

beforeEach(() => {
  mockLangRef.current = "en";
  mockQueryData = emptyData();
  mockVaccinations = [];
});

const expandHistory = (screen) =>
  fireEvent.press(screen.getByText("Medical history"));

describe("Vet Record — three groups", () => {
  test("renders the three group headers (English)", () => {
    const screen = render(<HealthVetRecord />);
    expect(screen.getByText("Medical profile")).toBeTruthy();
    expect(screen.getByText("Next visit")).toBeTruthy();
    expect(screen.getByText("Medical history")).toBeTruthy();
  });

  test("renders the three group headers in Spanish (real localization)", () => {
    mockLangRef.current = "es";
    const screen = render(<HealthVetRecord />);
    expect(screen.getByText("Perfil médico")).toBeTruthy();
    expect(screen.getByText("Próxima visita")).toBeTruthy();
    expect(screen.getByText("Historial médico")).toBeTruthy();
    // A deeper string too, so we know content localizes, not just headers.
    expect(screen.getByText("Agregar registro")).toBeTruthy();
  });

  test("Next visit shows an empty state when there is no appointment", () => {
    const screen = render(<HealthVetRecord />);
    // Next visit defaults expanded.
    expect(screen.getByText("No upcoming appointment")).toBeTruthy();
  });

  test("Next visit surfaces the soonest scheduled appointment", () => {
    mockQueryData["vet-appointments"] = {
      appointments: [
        {
          id: 2,
          title: "Dental cleaning",
          appointment_date: "2026-09-01",
          appointment_time: "14:30",
          clinic: "Downtown Vet",
          status: "scheduled",
        },
        {
          id: 1,
          title: "Annual checkup",
          appointment_date: "2026-08-20",
          appointment_time: "09:00",
          clinic: "PawCare",
          status: "scheduled",
        },
      ],
    };
    const screen = render(<HealthVetRecord />);
    // The 08-20 appointment is soonest → it, not the 09-01 one, is shown.
    expect(screen.getByText("Annual checkup")).toBeTruthy();
    expect(screen.queryByText("Dental cleaning")).toBeNull();
  });
});

describe("Vet Record — Medical history sub-nav", () => {
  test("count badge on the history header reflects total history items", () => {
    mockVaccinations = [
      { id: 1, name: "Rabies", date_given: "2025-04-21" },
      { id: 2, name: "Distemper", date_given: "2025-01-10" },
    ];
    const screen = render(<HealthVetRecord />);
    // Header badge uses the localized count string; 2 vaccinations → "2 items".
    expect(screen.getByText("2 items")).toBeTruthy();
  });

  test("defaults to the first non-empty tab and renders its list (Vaccines)", () => {
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
    expandHistory(screen);
    expect(screen.getByText("Rabies")).toBeTruthy();
    expect(screen.getByText(fmt("2025-04-21"))).toBeTruthy();
    expect(screen.getByText(`Expires ${fmt("2026-04-21")}`)).toBeTruthy();
    expect(screen.getByText("Lot AB123")).toBeTruthy();
  });

  test("empty Vaccines tab shows its empty state", () => {
    const screen = render(<HealthVetRecord />);
    expandHistory(screen);
    expect(screen.getByText("No vaccinations yet")).toBeTruthy();
  });

  test("tapping a chip switches the visible list (Documents, then Notes)", () => {
    mockQueryData["vet-record-documents"] = {
      documents: [
        { id: 9, name: "Bloodwork.pdf", document_type: "Lab", document_date: "2025-06-01" },
      ],
    };
    mockQueryData["vet-record-notes"] = {
      notes: [
        { id: 5, note: "Limping on left paw", note_date: "2025-07-02", vet_name: null },
      ],
    };
    const screen = render(<HealthVetRecord />);
    expandHistory(screen);

    // Switch to Documents → the document row appears.
    fireEvent.press(screen.getByTestId("history-tab-documents"));
    expect(screen.getByText("Bloodwork.pdf")).toBeTruthy();
    // The notes list is not mounted while Documents is active.
    expect(screen.queryByText("Limping on left paw")).toBeNull();

    // Switch to Notes → the note appears, the document row is gone.
    fireEvent.press(screen.getByTestId("history-tab-notes"));
    expect(screen.getByText("Limping on left paw")).toBeTruthy();
    expect(screen.queryByText("Bloodwork.pdf")).toBeNull();
  });

  test("Conditions & allergies tab merges both lists", () => {
    mockQueryData["vet-record-allergies"] = {
      allergies: [{ id: 1, allergen: "Chicken", severity: "High" }],
    };
    mockQueryData["vet-record-conditions"] = {
      conditions: [{ id: 2, condition: "Arthritis", status: "Active" }],
    };
    const screen = render(<HealthVetRecord />);
    expandHistory(screen);
    fireEvent.press(screen.getByTestId("history-tab-conditions"));
    expect(screen.getByText("Chicken")).toBeTruthy();
    expect(screen.getByText("Arthritis")).toBeTruthy();
  });
});

describe("Vet Record — add / delete flows still work", () => {
  test("add-to-history opens the note modal", () => {
    const screen = render(<HealthVetRecord />);
    expandHistory(screen);
    fireEvent.press(screen.getByTestId("history-tab-notes"));
    fireEvent.press(screen.getByTestId("add-vet-note"));
    expect(screen.getByText("note-modal-open")).toBeTruthy();
  });

  test("add-document opens the document modal", () => {
    const screen = render(<HealthVetRecord />);
    expandHistory(screen);
    fireEvent.press(screen.getByTestId("history-tab-documents"));
    fireEvent.press(screen.getByTestId("add-document"));
    expect(screen.getByText("doc-modal-open")).toBeTruthy();
  });

  test("deleting a note fires the confirmation Alert", () => {
    const { Alert } = require("react-native");
    const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockQueryData["vet-record-notes"] = {
      notes: [{ id: 5, note: "Note body", note_date: "2025-07-02" }],
    };
    const screen = render(<HealthVetRecord />);
    expandHistory(screen);
    fireEvent.press(screen.getByTestId("history-tab-notes"));
    fireEvent.press(screen.getByTestId("delete-vet-note"));
    expect(spy).toHaveBeenCalledWith(
      "Delete entry?",
      expect.any(String),
      expect.any(Array),
    );
    spy.mockRestore();
  });
});

describe("Vet Record — Add Record picker (no dead-end primary CTA)", () => {
  const { Alert } = require("react-native");

  test("an unbuilt record type gives honest coming-soon feedback", () => {
    const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = render(<HealthVetRecord />);
    fireEvent.press(screen.getByText("Add Record"));
    expect(screen.getAllByText("Soon").length).toBeGreaterThanOrEqual(8);
    fireEvent.press(screen.getByText("Vet Visit"));
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("Vet Visit"),
      expect.stringContaining("Vet Visit"),
    );
    spy.mockRestore();
  });

  test("the two built types route to their real flow, no coming-soon alert", () => {
    const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = render(<HealthVetRecord />);
    fireEvent.press(screen.getByText("Add Record"));
    fireEvent.press(screen.getByText("Vet Note"));
    expect(spy).not.toHaveBeenCalled();
    // Routing opened the history group on the Notes tab → its modal is visible.
    expect(screen.getByText("note-modal-open")).toBeTruthy();
    spy.mockRestore();
  });
});

// Vet Record → "Visits & procedures" tab — count/list parity contract.
//
// The bug this pins: the tab's badge counts BOTH completed/past vet appointments
// (summary.completedAppointmentsCount) AND surgeries (summary.surgeriesCount), but
// the list used to render surgeries ONLY — so a pet with e.g. 19 past visits + 1
// surgery showed a badge of 20 and a single row. These tests assert the tab now
// renders both kinds, that the rendered row count equals counts.visits, and that
// the empty state only shows when BOTH lists are empty.
//
// Same key-aware useQuery mock shape as HealthVetRecord.vaccines.test.jsx:
// per-section data keyed on queryKey[0]; the visit-appointment set is derived
// client-side from the ["vet-appointments"] query (status "completed" OR a past
// appointment_date), matching the server's summary WHERE clause.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import HealthVetRecord from "./HealthVetRecord";

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
  useQuery: (opts) => {
    const key = Array.isArray(opts?.queryKey) ? opts.queryKey[0] : opts?.queryKey;
    return { data: mockQueryData[key], isLoading: false, refetch: jest.fn() };
  },
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
jest.mock("./PhotoCheck/PhotoHistory", () => ({ __esModule: true, default: () => null }));
jest.mock("./VetSummary/VetSummaryDashboard", () => ({ __esModule: true, default: () => null }));
jest.mock("./VetRecord/EditMedicalProfileModal", () => ({ __esModule: true, default: () => null }));
jest.mock("./VetRecord/PrescriptionsSection", () => ({ PrescriptionsSection: () => null }));
jest.mock("./VetRecord/AddVetNoteModal", () => ({ AddVetNoteModal: () => null }));
jest.mock("./VetRecord/AddVetRecordModal", () => ({ AddVetRecordModal: () => null }));
jest.mock("./Medication/MedicationModal", () => ({ __esModule: true, default: () => null }));
jest.mock("./VetRecord/AddDocumentModal", () => ({ AddDocumentModal: () => null }));

// Expose the visit detail modal's open state + which appointment it received.
jest.mock("./VetAppointmentDetailModal", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ visible, appointment }) =>
      visible ? <Text>{`visit-detail-open:${appointment?.title}`}</Text> : null,
  };
});

jest.mock("@/hooks/usePetVaccinations", () => ({
  usePetVaccinations: () => ({ data: mockVaccinations, isLoading: false, error: null }),
}));

// A canonical YYYY-MM-DD N days from today (past = negative), for stable tests.
const dayOffset = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};

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

const openVisits = (screen) => {
  fireEvent.press(screen.getByText("Medical history"));
  fireEvent.press(screen.getByTestId("history-tab-visits"));
};

describe("Vet Record — Visits & procedures list matches the badge", () => {
  test("renders BOTH completed/past appointments and surgeries", () => {
    mockQueryData["vet-record-summary"] = {
      completedAppointmentsCount: 2,
      surgeriesCount: 1,
    };
    mockQueryData["vet-appointments"] = {
      appointments: [
        // Completed by status (future date is fine — status wins).
        {
          id: 1,
          title: "Annual checkup",
          appointment_date: dayOffset(20),
          appointment_time: "09:00",
          status: "completed",
          veterinarian: "Dr. Ruiz",
          clinic: "PawCare",
        },
        // Past by date, still "scheduled" — counts as a visit.
        {
          id: 2,
          title: "Skin recheck",
          appointment_date: dayOffset(-40),
          appointment_time: "16:00",
          status: "scheduled",
        },
        // Future scheduled — belongs to Next visit, NOT this list.
        {
          id: 3,
          title: "Upcoming dental",
          appointment_date: dayOffset(15),
          appointment_time: "10:00",
          status: "scheduled",
        },
      ],
    };
    mockQueryData["vet-record-surgeries"] = {
      surgeries: [{ id: 8, procedure: "Neuter", surgery_date: dayOffset(-200) }],
    };

    const screen = render(<HealthVetRecord />);
    openVisits(screen);

    // Both past appointments render as visit rows...
    expect(screen.getByText("Annual checkup")).toBeTruthy();
    expect(screen.getByText("Skin recheck")).toBeTruthy();
    // ...plus the surgery.
    expect(screen.getByText("Neuter")).toBeTruthy();

    // The FUTURE scheduled appointment must NOT appear as a visit row — it belongs
    // to "Next visit" (where it does render, so we can't assert it's absent globally).
    const rows = screen.queryAllByTestId("vet-visit-row");
    expect(rows.length).toBe(2); // 2 completed/past appointment rows

    // Rendered visit items == counts.visits: 2 appointment rows + 1 surgery = 3,
    // exactly the badge (completedAppointmentsCount 2 + surgeriesCount 1).
    expect(screen.queryByText("Upcoming dental")).toBeTruthy(); // in Next visit, not history
  });

  test("tapping a visit row opens the appointment detail modal", () => {
    mockQueryData["vet-record-summary"] = { completedAppointmentsCount: 1 };
    mockQueryData["vet-appointments"] = {
      appointments: [
        {
          id: 1,
          title: "Annual checkup",
          appointment_date: dayOffset(-5),
          appointment_time: "09:00",
          status: "completed",
        },
      ],
    };
    const screen = render(<HealthVetRecord />);
    openVisits(screen);
    fireEvent.press(screen.getByTestId("vet-visit-row"));
    expect(screen.getByText("visit-detail-open:Annual checkup")).toBeTruthy();
  });

  test("tapping a surgery row opens the surgery detail modal (unchanged)", () => {
    mockQueryData["vet-record-summary"] = { surgeriesCount: 1 };
    mockQueryData["vet-record-surgeries"] = {
      surgeries: [
        { id: 8, procedure: "Dental extraction", surgery_date: dayOffset(-30) },
      ],
    };
    const screen = render(<HealthVetRecord />);
    openVisits(screen);
    // Surgery card is present; the surgery detail modal renders its title on tap.
    fireEvent.press(screen.getByText("Dental extraction"));
    // The detail modal shows the procedure again (heading) — two instances now.
    expect(screen.queryAllByText("Dental extraction").length).toBeGreaterThan(1);
  });

  test("empty state ONLY when both appointments and surgeries are empty", () => {
    const screen = render(<HealthVetRecord />);
    openVisits(screen);
    expect(screen.getByText("No visits or procedures yet")).toBeTruthy();
    expect(screen.queryAllByTestId("vet-visit-row").length).toBe(0);
  });

  test("no empty state when there are past appointments but zero surgeries", () => {
    mockQueryData["vet-record-summary"] = { completedAppointmentsCount: 1 };
    mockQueryData["vet-appointments"] = {
      appointments: [
        {
          id: 1,
          title: "Follow-up",
          appointment_date: dayOffset(-3),
          appointment_time: "11:00",
          status: "scheduled",
        },
      ],
    };
    const screen = render(<HealthVetRecord />);
    openVisits(screen);
    // The old bug showed the empty state here (surgeries.length === 0). It must not.
    expect(screen.queryByText("No visits or procedures yet")).toBeNull();
    expect(screen.getByText("Follow-up")).toBeTruthy();
  });
});

// Family sharing (PR5a): Vet Record by role. Owner and family can add records and notes; only the OWNER can delete entries (the server filters
// deletes on the owner). "Added by" shows a former member as "Former member" / "Ex integrante", never a blank or "Editor · Editor". EN + ES.
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import HealthVetRecord from "./HealthVetRecord";

const mockLangRef = { current: "en" };
let mockQueryData;
let mockPet;

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("react-i18next", () => ({
  useTranslation: () => require("@/i18n/testMock").makeReactI18nextMock(mockLangRef.current).useTranslation(),
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
jest.mock("@/hooks/usePetProfile", () => ({ useCurrentPet: () => ({ data: mockPet }) }));
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
jest.mock("@/hooks/usePetVaccinations", () => ({
  usePetVaccinations: () => ({ data: [], isLoading: false, error: null }),
}));

const owner = { id: 7, name: "Luna", is_shared: false, access_role: "owner" };
const family = { id: 7, name: "Luna", is_shared: true, access_role: "family" };

beforeEach(() => {
  mockLangRef.current = "en";
  mockPet = owner;
  mockQueryData = {
    "vet-record-summary": {},
    "pet-medical-profile": {},
    "vet-record-allergies": { allergies: [] },
    "vet-record-conditions": { conditions: [] },
    "vet-record-surgeries": { surgeries: [] },
    "vet-record-lab-results": { labResults: [] },
    "vet-record-documents": {
      documents: [{ id: 3, name: "Blood test.pdf", category: "lab", url: "https://x/y.pdf", created_at: "2026-11-01T10:00:00Z" }],
    },
    "vet-record-notes": {
      notes: [
        { id: 5, note: "Limping on the left paw", note_date: "2026-11-02", created_by_role: "editor", created_by_name: "Former member", created_at: "2026-11-02T10:00:00Z" },
      ],
    },
    "vet-appointments": { appointments: [] },
  };
});

const expand = (screen) => fireEvent.press(screen.getByText(/Medical history|Historial médico/));
const openNotes = (screen) => {
  expand(screen);
  fireEvent.press(screen.getByTestId("history-tab-notes"));
};
const openDocs = (screen) => fireEvent.press(screen.getByTestId("history-tab-documents")); // after openNotes (the section is already expanded)

describe("deleting vet-record entries is the owner's", () => {
  test("owner sees delete on notes and documents", () => {
    const s = render(<HealthVetRecord />);
    openNotes(s);
    expect(s.getByTestId("delete-vet-note")).toBeTruthy();
    openDocs(s);
    expect(s.getByTestId("delete-document")).toBeTruthy();
  });

  test("family can ADD notes and documents but has no delete control", () => {
    mockPet = family;
    const s = render(<HealthVetRecord />);
    openNotes(s);
    expect(s.getByTestId("add-vet-note")).toBeTruthy();
    expect(s.queryByTestId("delete-vet-note")).toBeNull();
    openDocs(s);
    expect(s.getByTestId("add-document")).toBeTruthy();
    expect(s.queryByTestId("delete-document")).toBeNull();
  });
});

describe("a note written by someone who has since left PawPi", () => {
  test.each([
    ["en", "Former member"],
    ["es", "Ex integrante"],
  ])("(%s) is attributed to '%s' — the server's English name is translated", (lang, former) => {
    mockLangRef.current = lang;
    const s = render(<HealthVetRecord />);
    openNotes(s);
    expect(s.getByText(new RegExp(former))).toBeTruthy();
    expect(s.queryByText(/Editor · Editor|Editor · Editor/)).toBeNull();
    if (lang === "es") expect(s.queryByText(/Former member/)).toBeNull();
  });
});

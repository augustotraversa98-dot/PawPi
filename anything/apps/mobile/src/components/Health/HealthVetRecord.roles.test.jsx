// Family sharing (PR5a): Vet Record by role. Owner and family can add records and notes; only the OWNER can delete entries (the server filters
// deletes on the owner). "Added by" shows a former member as "Former member" / "Ex integrante", never a blank or "Editor · Editor". EN + ES.
import React from "react";
import { StyleSheet } from "react-native";
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
jest.mock("./VetShare/ShareWithVetSheet", () => {
  const { Text } = require("react-native");
  return { __esModule: true, default: ({ pet }) => <Text testID="vet-share-sheet">{pet.name}</Text> };
});
let mockVaccines;
jest.mock("@/hooks/usePetVaccinations", () => ({
  usePetVaccinations: () => ({ data: mockVaccines, isLoading: false, error: null }),
}));

const owner = { id: 7, name: "Luna", is_shared: false, access_role: "owner" };
const family = { id: 7, name: "Luna", is_shared: true, access_role: "family" };

beforeEach(() => {
  mockLangRef.current = "en";
  mockPet = owner;
  mockVaccines = [];
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

test("Share opens the share-with-your-vet sheet for the active pet, in place", () => {
  const s = render(<HealthVetRecord />);
  expect(s.queryByTestId("vet-share-sheet")).toBeNull();
  fireEvent.press(s.getByText("Share"));
  expect(s.getByTestId("vet-share-sheet")).toBeTruthy();
});

describe("a note card's author lines", () => {
  const linkNote = {
    id: 6,
    note: "Added without signing in",
    note_date: "2026-11-26",
    via_record_link: true,
    external_author_name: "A rather long clinic name that needs room",
    // 00:30 on the 27th on this device (the suite runs in Europe/Rome), still the 26th inside the timestamp.
    created_at: "2026-11-26T23:30:00.000Z",
  };

  test("a long author name takes the free space and keeps a gap from the date", () => {
    mockQueryData["vet-record-notes"] = { notes: [linkNote] };
    const s = render(<HealthVetRecord />);
    openNotes(s);
    const author = s.getByTestId("vet-note-author");
    expect(StyleSheet.flatten(author.props.style).flex).toBe(1);
    let row = author.parent;
    while (row && StyleSheet.flatten(row.props.style)?.flexDirection !== "row") row = row.parent;
    expect(StyleSheet.flatten(row.props.style).gap).toBeGreaterThan(0);
  });

  test("'added' is the date on this device; the note's own date stays as written", () => {
    expect(new Date(linkNote.created_at).getDate()).toBe(27);
    mockQueryData["vet-record-notes"] = {
      notes: [linkNote, { id: 7, note: "Check-up", note_date: "2026-10-01", created_by_role: "owner", created_at: "2026-11-26T23:30:00.000Z" }],
    };
    const s = render(<HealthVetRecord />);
    openNotes(s);
    expect(s.getByText("Added through a shared link by A rather long clinic name that needs room · 27 November 2026")).toBeTruthy();
    expect(s.getByText(/Added by .*27 November 2026/)).toBeTruthy();
    expect(s.getByText("26 November 2026")).toBeTruthy();
    expect(s.getByText("1 October 2026")).toBeTruthy();
  });
});

// What a vet added says who added it, on every kind of row, and never reads as the owner's or the family's.
describe("rows a vet added", () => {
  const at = "2026-11-02T10:00:00Z";
  const byClinic = {
    created_at: at,
    added_by_provider_id: 3,
    added_by_provider_name: "North Clinic",
    created_by_role: "editor",
    created_by_name: "North Clinic",
  };
  const byLink = {
    created_at: at,
    via_record_link: true,
    external_author_name: null,
    created_by_role: "editor",
    created_by_name: "Anonymous (shared link)",
  };

  beforeEach(() => {
    mockVaccines = [{ id: 1, name: "Rabies", ...byClinic }];
    mockQueryData["vet-record-lab-results"] = {
      labResults: [{ id: 2, test_name: "Blood panel", test_date: "2026-11-01", ...byLink, external_author_name: "Dr. Ruiz" }],
    };
    mockQueryData["vet-record-documents"] = {
      documents: [{ id: 3, name: "Scan.pdf", category: "lab", url: "https://x/y.pdf", ...byLink }],
    };
    mockQueryData["vet-record-notes"] = {
      notes: [{ id: 5, note: "Booster done", note_date: "2026-11-02", ...byClinic, vet_edited_at: "2026-11-05T10:00:00Z" }],
    };
    mockQueryData["vet-record-summary"] = { labResultsCount: 1, documentsCount: 1, vetNotesCount: 1 };
  });

  test.each([
    ["en", [
      "Added by North Clinic · 2 November 2026",
      "Added through a shared link by Dr. Ruiz · 2 November 2026",
      "Added through a shared link by Anonymous · 2 November 2026",
      "Added by North Clinic · 2 November 2026 · edited 5 November 2026",
    ]],
    ["es", [
      /^Agregado por North Clinic · /,
      /^Agregado desde un enlace compartido por Dr\. Ruiz · /,
      /^Agregado desde un enlace compartido por Anónimo · /,
      /^Agregado por North Clinic · .* · editada /,
    ]],
  ])("(%s) vaccines, lab results, documents and notes", (lang, [vaccine, lab, document, note]) => {
    mockLangRef.current = lang;
    const s = render(<HealthVetRecord />);
    expand(s);
    const open = (tab) => fireEvent.press(s.getByTestId(`history-tab-${tab}`));
    open("vaccines");
    expect(s.getByText(vaccine)).toBeTruthy();
    open("labs");
    expect(s.getByText(lab)).toBeTruthy();
    open("documents");
    expect(s.getByText(document)).toBeTruthy();
    open("notes");
    expect(s.getByText(note)).toBeTruthy();
    expect(s.getByTestId("vet-note-author").props.children).toBe("North Clinic");
  });
});

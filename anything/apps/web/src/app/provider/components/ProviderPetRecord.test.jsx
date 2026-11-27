import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from "@testing-library/react";

// The data + mutation hooks are mocked so this test isolates the consent state
// machine (403 → request → pending → granted → write, plus revoke-mid-session)
// and the write forms. react-router's Link is stubbed to a plain anchor.
// The writes an access with "can add" offers.
const writes = vi.hoisted(() => ({
  editNote: { mutate: vi.fn(), isPending: false },
  addLabResult: { mutate: vi.fn(), isPending: false },
  addDocument: { mutate: vi.fn(), isPending: false },
}));
vi.mock("react-router", () => ({
  Link: ({ to, children, ...p }) => (
    <a href={to} {...p}>
      {children}
    </a>
  ),
}));
vi.mock("../hooks/useProviders", () => ({
  usePetRecord: vi.fn(),
  useRequestAccess: vi.fn(),
  useAddVetNote: vi.fn(),
  useAddVaccination: vi.fn(),
  useEditVetNote: () => writes.editNote,
  useAddLabResult: () => writes.addLabResult,
  useAddDocument: () => writes.addDocument,
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import {
  usePetRecord,
  useRequestAccess,
  useAddVetNote,
  useAddVaccination,
} from "../hooks/useProviders";
import { toast } from "sonner";
import ProviderPetRecord from "./ProviderPetRecord";

const GRANTED = {
  medical_profile: {
    microchip_id: "CHIP-123",
    primary_vet_name: "Dr Prior",
    medical_notes: "Sensitive to penicillin",
  },
  notes: [
    {
      id: 1,
      note_date: "2026-06-01",
      vet_name: "Dr Prior",
      note: "Healthy on exam",
      appointment_id: 9,
    },
  ],
  vaccinations: [
    {
      id: 1,
      name: "Rabies",
      date_given: "2026-05-01",
      expires_on: "2027-05-01",
      lot: "LOT-7",
    },
  ],
};

let requestMutate, addNoteMutate, addVaccinationMutate, refetch;

function setRecord(extra) {
  usePetRecord.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch,
    ...extra,
  });
}

function renderScreen(props = {}) {
  return render(
    <ProviderPetRecord
      providerId={3}
      petId={55}
      bookingId="9"
      petName="Rex"
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requestMutate = vi.fn();
  addNoteMutate = vi.fn();
  addVaccinationMutate = vi.fn();
  refetch = vi.fn();
  useRequestAccess.mockReturnValue({ mutate: requestMutate, isPending: false });
  useAddVetNote.mockReturnValue({ mutate: addNoteMutate, isPending: false });
  useAddVaccination.mockReturnValue({
    mutate: addVaccinationMutate,
    isPending: false,
  });
  setRecord({}); // default: empty (no data, not error) — overridden per test
});

describe("ProviderPetRecord — consent states", () => {
  it("403 → shows the Request access panel for the pet", () => {
    setRecord({ isError: true, error: { status: 403 } });
    renderScreen();
    expect(
      screen.getByText(/Request clinical access for Rex/i),
    ).toBeInTheDocument();
    // The consent/audit line is always visible.
    expect(
      screen.getByText(/every view and entry is logged/i),
    ).toBeInTheDocument();
  });

  it("Request calls useRequestAccess with the 3 clinical scopes + bookingId", () => {
    setRecord({ isError: true, error: { status: 403 } });
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: /request access/i }));
    expect(requestMutate).toHaveBeenCalledTimes(1);
    expect(requestMutate.mock.calls[0][0]).toEqual({
      petId: 55,
      scopes: ["medical_read", "medical_write", "vaccinations_write"],
      bookingId: "9",
    });
  });

  it("after a successful request → pending state with a Refresh affordance", async () => {
    setRecord({ isError: true, error: { status: 403 } });
    requestMutate.mockImplementation((_body, opts) => opts.onSuccess());
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: /request access/i }));

    expect(
      await screen.findByText(/waiting for the owner to approve/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /refresh/i }),
    ).toBeInTheDocument();
  });

  it("a 409 on request is treated as pending (not a hard error)", async () => {
    setRecord({ isError: true, error: { status: 403 } });
    requestMutate.mockImplementation((_body, opts) =>
      opts.onError({ status: 409, message: "already pending" }),
    );
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: /request access/i }));

    expect(
      await screen.findByText(/waiting for the owner to approve/i),
    ).toBeInTheDocument();
  });

  it("granted → renders medical profile, notes, and vaccinations", () => {
    setRecord({ data: GRANTED });
    renderScreen();
    expect(screen.getByText("CHIP-123")).toBeInTheDocument();
    expect(screen.getByText("Sensitive to penicillin")).toBeInTheDocument();
    expect(screen.getByText("Healthy on exam")).toBeInTheDocument();
    expect(screen.getByText("Rabies")).toBeInTheDocument();
    expect(screen.getByText(/Booking #9/)).toBeInTheDocument();
  });

  it("granted + null profile → medical profile empty state", () => {
    setRecord({ data: { ...GRANTED, medical_profile: null } });
    renderScreen();
    expect(screen.getByText(/No medical profile on file/i)).toBeInTheDocument();
  });

  it("a post-load 403 (stale data + error) flips back to the access panel, not the record", () => {
    // Owner revoked mid-session: the query has prior data AND a fresh 403.
    setRecord({ data: GRANTED, isError: true, error: { status: 403 } });
    renderScreen();
    // The access panel wins; the stale record is NOT shown.
    expect(
      screen.getByText(/Request clinical access for Rex/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Healthy on exam")).not.toBeInTheDocument();
  });
});

describe("ProviderPetRecord — writes", () => {
  it("Add note requires a note and then calls useAddVetNote", async () => {
    setRecord({ data: GRANTED });
    renderScreen();

    // Empty submit → validation blocks the mutation.
    fireEvent.click(screen.getByRole("button", { name: /add note/i }));
    expect(await screen.findByText(/note is required/i)).toBeInTheDocument();
    expect(addNoteMutate).not.toHaveBeenCalled();

    // With a note → posts { note }.
    fireEvent.change(screen.getByPlaceholderText(/Exam findings/i), {
      target: { value: "Recheck in 2 weeks" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add note/i }));
    await waitFor(() => expect(addNoteMutate).toHaveBeenCalledTimes(1));
    expect(addNoteMutate.mock.calls[0][0]).toEqual({
      note: "Recheck in 2 weeks",
    });
  });

  it("Add vaccination requires a name and then calls useAddVaccination", async () => {
    setRecord({ data: GRANTED });
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: /add vaccination/i }));
    expect(
      await screen.findByText(/vaccine name is required/i),
    ).toBeInTheDocument();
    expect(addVaccinationMutate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText("Rabies"), {
      target: { value: "Bordetella" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add vaccination/i }));
    await waitFor(() => expect(addVaccinationMutate).toHaveBeenCalledTimes(1));
    expect(addVaccinationMutate.mock.calls[0][0]).toEqual({
      name: "Bordetella",
    });
  });

  it("a write that 403s drops back to the access panel and refetches", async () => {
    setRecord({ data: GRANTED });
    addNoteMutate.mockImplementation((_body, opts) =>
      opts.onError({ status: 403, message: "Not authorized" }),
    );
    renderScreen();

    fireEvent.change(screen.getByPlaceholderText(/Exam findings/i), {
      target: { value: "x" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add note/i }));

    await waitFor(() => expect(refetch).toHaveBeenCalled());
  });
});

const SHARED = {
  sharedSections: [
    "emergency_contact",
    "insurance",
    "vet_notes",
    "vaccines",
    "files",
    "photos",
    "lab_results",
  ],
  medical_profile: {
    emergency_contact_name: "Ana",
    emergency_contact_phone: "555-0100",
    insurance_provider: "Insurer Co",
    insurance_policy_number: "POL-9",
  },
  notes: GRANTED.notes,
  vaccinations: GRANTED.vaccinations,
  documents: [
    { id: 1, name: "X-ray report", file_url: "pets/55/xray.pdf" },
    { id: 2, name: "Old scan", file_url: "file:///var/mobile/scan.jpg" },
  ],
  photo_checks: [
    {
      id: 1,
      body_area: "ears",
      image_url: "pets/55/ear.jpg",
      created_at: "2026-06-02",
    },
  ],
  lab_results: [
    {
      id: 1,
      test_name: "Blood panel",
      test_date: "2026-06-03",
      results: "In range",
    },
  ],
};

describe("ProviderPetRecord — shared by section", () => {
  it("shows the shared sections and files, read only", () => {
    setRecord({ data: SHARED });
    renderScreen();
    for (const text of [
      "Ana",
      "POL-9",
      "Healthy on exam",
      "Rabies",
      "X-ray report",
      "Blood panel",
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByTestId("not-shared-sections")).toHaveTextContent(
      "Medical profile",
    );
    expect(screen.getByRole("link", { name: "Open file" })).toHaveAttribute(
      "href",
      "/api/media?key=pets%2F55%2Fxray.pdf&providerId=3",
    );
    expect(screen.getByText("File not available")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Ears" })).toHaveAttribute(
      "src",
      "/api/media?key=pets%2F55%2Fear.jpg&providerId=3",
    );
    // No write form of any kind.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(/Exam findings/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Rabies")).not.toBeInTheDocument();
  });

  it("renders nothing of a section that was not shared, even if data arrived", () => {
    setRecord({ data: { ...SHARED, sharedSections: ["vaccines"] } });
    renderScreen();
    expect(screen.getByText("Rabies")).toBeInTheDocument();
    for (const text of [
      "Ana",
      "POL-9",
      "Healthy on exam",
      "X-ray report",
      "Blood panel",
    ]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
    expect(screen.getByTestId("shared-sections")).toHaveTextContent(
      "Vaccinations",
    );
    expect(screen.getByTestId("not-shared-sections")).toHaveTextContent(
      "Insurance",
    );
  });

  it("reads in es-AR for a Spanish-language browser", () => {
    const languages = vi
      .spyOn(window.navigator, "languages", "get")
      .mockReturnValue(["es-AR"]);
    setRecord({ data: { ...SHARED, sharedSections: ["vaccines"] } });
    renderScreen();
    expect(screen.getByText("Historia clínica — Rex")).toBeInTheDocument();
    expect(screen.getByText(/Solo lectura/)).toBeInTheDocument();
    expect(screen.getByText("01/05/2026")).toBeInTheDocument();
    languages.mockRestore();
  });
});

describe("ProviderPetRecord — notes added through a record link", () => {
  const linkNote = (over) => ({
    id: 20,
    note_date: "2026-06-02",
    note: "From outside",
    vet_name: "Cambios de alguien externo",
    via_record_link: true,
    external_author_name: null,
    ...over,
  });

  it("marks them, names the signed-in author and calls anyone else Anonymous", () => {
    setRecord({
      data: {
        ...GRANTED,
        notes: [
          linkNote(),
          linkNote({ id: 21, external_author_name: "Paula G.", vet_name: "Paula G." }),
          linkNote({ id: 22, external_author_name: "Former member", vet_name: "Ex integrante" }),
          GRANTED.notes[0],
        ],
      },
    });
    renderScreen();
    expect(screen.getAllByText("Added through a shared link")).toHaveLength(3);
    expect(screen.getByText("· Anonymous")).toBeInTheDocument();
    expect(screen.getByText("· Paula G.")).toBeInTheDocument();
    expect(screen.getByText("· Former member")).toBeInTheDocument();
    expect(screen.queryByText("· Cambios de alguien externo")).toBeNull();
    expect(screen.getByText("· Dr Prior")).toBeInTheDocument();
  });
});

describe("ProviderPetRecord — Spanish", () => {
  beforeEach(() => {
    vi.spyOn(window.navigator, "languages", "get").mockReturnValue(["es-AR"]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("words a refused load from the server in Spanish, and a generic one with its own text", () => {
    setRecord({ isError: true, error: { status: 404, message: "Pet not found" } });
    const first = renderScreen();
    expect(screen.getByText("No encontramos esta mascota.")).toBeInTheDocument();
    first.unmount();
    setRecord({ isError: true, error: { status: 500, message: "Failed to load medical record" } });
    renderScreen();
    expect(screen.getByText("Probá de nuevo.")).toBeInTheDocument();
  });

  it("words the form rules and a refused write in Spanish", async () => {
    setRecord({ data: GRANTED });
    addNoteMutate.mockImplementation((_body, opts) => opts.onError({ status: 404, message: "Pet not found" }));
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Agregar nota" }));
    expect(await screen.findByText("Escribí la nota")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Agregar vacuna" }));
    expect(await screen.findByText("Escribí el nombre de la vacuna")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Hallazgos del examen/), { target: { value: "Control" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar nota" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("No encontramos esta mascota."));
  });
});

describe("ProviderPetRecord — a share that lets the business add", () => {
  const OWN = { id: 31, note_date: "2026-11-20", vet_name: "Dr Paula", note: "My note", editable: true };
  const adding = (editSections) => ({
    ...SHARED,
    editSections,
    notes: [...SHARED.notes, OWN],
  });
  const forms = () => ({
    note: screen.queryByPlaceholderText(/Exam findings/i),
    vaccine: screen.queryByPlaceholderText("Rabies"),
    lab: screen.queryByRole("form", { name: "Add lab result" }),
    document: screen.queryByRole("form", { name: "Add document" }),
    edit: screen.queryByRole("button", { name: "Edit note" }),
  });

  it.each([
    ["vet_notes", ["note", "edit"]],
    ["vaccines", ["vaccine"]],
    ["lab_results", ["lab"]],
    ["files", ["document"]],
  ])("offers only what '%s' allows", (section, expected) => {
    setRecord({ data: adding([section]) });
    renderScreen();
    for (const [form, element] of Object.entries(forms())) {
      expect(!!element, form).toBe(expected.includes(form));
    }
    expect(screen.getByTestId("shared-access")).toHaveTextContent("You can add to:");
  });

  it("marks what came through a record link, with the name or as anonymous", () => {
    setRecord({
      data: {
        ...adding([]),
        vaccinations: [{ id: 5, name: "Parvo", via_record_link: true }],
        lab_results: [{ id: 6, test_name: "Urine", test_date: "2026-11-01", via_record_link: true, external_author_name: "Dr. Gómez" }],
      },
    });
    renderScreen();
    expect(screen.getByText("From a shared link: Anonymous")).toBeInTheDocument();
    expect(screen.getByText("From a shared link: Dr. Gómez")).toBeInTheDocument();
  });

  it("view only offers nothing, even for a note marked editable", () => {
    setRecord({ data: adding([]) });
    renderScreen();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByTestId("shared-access")).toHaveTextContent("Read only");
  });

  it("corrects its own note", async () => {
    setRecord({ data: adding(["vet_notes"]) });
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
    expect(screen.getByLabelText("Correct your note")).toHaveValue("My note");
    fireEvent.change(screen.getByLabelText("Correct your note"), { target: { value: " Fixed " } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(writes.editNote.mutate).toHaveBeenCalledWith({ noteId: 31, note: "Fixed" }, expect.anything());
  });

  it("sends a lab result with only what was written", async () => {
    setRecord({ data: adding(["lab_results"]) });
    renderScreen();
    const form = screen.getByRole("form", { name: "Add lab result" });
    fireEvent.submit(form);
    expect(await screen.findByText("Write the test name and its date")).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText("Test *"), { target: { value: "Urine" } });
    fireEvent.change(within(form).getByLabelText("Test date *"), { target: { value: "2026-11-01" } });
    fireEvent.submit(form);
    await waitFor(() =>
      expect(writes.addLabResult.mutate).toHaveBeenCalledWith(
        { test_name: "Urine", test_date: "2026-11-01" },
        expect.anything(),
      ),
    );
  });

  it("uploads a document as a form with its file", () => {
    setRecord({ data: adding(["files"]) });
    renderScreen();
    const form = screen.getByRole("form", { name: "Add document" });
    fireEvent.submit(form);
    expect(screen.getByText("Choose a file and give it a name")).toBeInTheDocument();
    const file = new File(["%PDF-1.4"], "blood.pdf", { type: "application/pdf" });
    fireEvent.change(within(form).getByLabelText("File *"), { target: { files: [file] } });
    fireEvent.change(within(form).getByLabelText("Document name *"), { target: { value: "Blood" } });
    fireEvent.submit(form);
    const sent = writes.addDocument.mutate.mock.calls[0][0];
    expect(sent.get("name")).toBe("Blood");
    expect(sent.get("category")).toBe("lab");
    expect(sent.get("file").name).toBe("blood.pdf");
  });
});

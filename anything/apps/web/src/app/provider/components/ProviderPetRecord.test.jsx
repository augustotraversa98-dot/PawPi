import { describe, it, expect, vi, beforeEach } from "vitest";
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
    expect(screen.getByText(/every view and entry is logged/i)).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
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
    expect(
      screen.getByText(/No medical profile on file/i),
    ).toBeInTheDocument();
  });

  it("a post-load 403 (stale data + error) flips back to the access panel, not the record", () => {
    // Owner revoked mid-session: the query has prior data AND a fresh 403.
    setRecord({ data: GRANTED, isError: true, error: { status: 403 } });
    renderScreen();
    // The access panel wins; the stale record is NOT shown.
    expect(screen.getByText(/Request clinical access for Rex/i)).toBeInTheDocument();
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
    fireEvent.change(
      screen.getByPlaceholderText(/Exam findings/i),
      { target: { value: "Recheck in 2 weeks" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /add note/i }));
    await waitFor(() => expect(addNoteMutate).toHaveBeenCalledTimes(1));
    expect(addNoteMutate.mock.calls[0][0]).toEqual({ note: "Recheck in 2 weeks" });
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
    expect(addVaccinationMutate.mock.calls[0][0]).toEqual({ name: "Bordetella" });
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

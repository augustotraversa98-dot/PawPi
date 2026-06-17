import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ProviderTraining (ticket 2.10) — the trainer workspace. The data hooks are mocked; we
// assert: the session list renders 1:1 / group-class / program sessions with the seat count,
// the empty state shows, creating a session calls the create mutation, and expanding a class
// reveals its roster + logging a progress note calls the log mutation.

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../hooks/useProviders", () => ({
  useTrainingSessions: vi.fn(),
  useCreateTrainingSession: vi.fn(),
  useTrainingProgress: vi.fn(),
  useLogTrainingProgress: vi.fn(),
}));

import {
  useTrainingSessions,
  useCreateTrainingSession,
  useTrainingProgress,
  useLogTrainingProgress,
} from "../hooks/useProviders";
import ProviderTraining from "./ProviderTraining";

const mutationStub = (overrides = {}) => ({
  mutateAsync: vi.fn().mockResolvedValue({}),
  isPending: false,
  ...overrides,
});

function setSessions(data, extra = {}) {
  useTrainingSessions.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    error: null,
    ...extra,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  useCreateTrainingSession.mockReturnValue(mutationStub());
  useLogTrainingProgress.mockReturnValue(mutationStub());
  useTrainingProgress.mockReturnValue({ data: [], isLoading: false });
});

describe("ProviderTraining sessions", () => {
  it("renders sessions with the group-class seat count", () => {
    setSessions([
      {
        id: 1,
        kind: "group_class",
        title: "Saturday Recall Class",
        capacity: 6,
        attendee_count: 2,
      },
    ]);
    render(<ProviderTraining providerId={3} />);
    expect(screen.getByText("Saturday Recall Class")).toBeTruthy();
    expect(screen.getByText(/2 \/ 6 seats/)).toBeTruthy();
  });

  it("shows the empty state when there are no sessions (no fakes)", () => {
    setSessions([]);
    render(<ProviderTraining providerId={3} />);
    expect(screen.getByText("No sessions yet")).toBeTruthy();
  });

  it("creating a session calls the create mutation with kind + title + capacity", async () => {
    setSessions([]);
    const create = mutationStub();
    useCreateTrainingSession.mockReturnValue(create);
    render(<ProviderTraining providerId={3} />);

    fireEvent.change(screen.getByPlaceholderText(/Title/), {
      target: { value: "New class" },
    });
    fireEvent.change(screen.getByPlaceholderText("Capacity"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByText("Create"));

    expect(create.mutateAsync).toHaveBeenCalledWith({
      kind: "group_class",
      title: "New class",
      capacity: 5,
    });
  });

  it("logging a progress note for a roster attendee calls the log mutation", async () => {
    setSessions([
      { id: 1, kind: "group_class", title: "Class", capacity: 6, attendee_count: 1 },
    ]);
    useTrainingProgress.mockReturnValue({
      data: [{ id: 33, pet_id: 55, pet_name: "Rex", status: "booked" }],
      isLoading: false,
    });
    const log = mutationStub();
    useLogTrainingProgress.mockReturnValue(log);
    render(<ProviderTraining providerId={3} />);

    fireEvent.click(screen.getByText("Log progress"));
    fireEvent.change(screen.getByPlaceholderText(/Progress note/), {
      target: { value: "Great recall" },
    });
    fireEvent.click(screen.getByText("Mark attended + save"));

    expect(log.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        progress_id: 33,
        progress_note: "Great recall",
        attended: true,
        status: "completed",
      }),
    );
  });
});

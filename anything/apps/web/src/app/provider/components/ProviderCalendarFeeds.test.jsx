import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ProviderCalendarFeeds (ticket 2.84) — add / list / refresh / remove iCal feeds. Hooks mocked.

vi.mock("../hooks/useProviders", () => ({
  useProviderCalendarFeeds: vi.fn(),
  useAddCalendarFeed: vi.fn(),
  useSyncCalendarFeed: vi.fn(),
  useRemoveCalendarFeed: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import {
  useProviderCalendarFeeds,
  useAddCalendarFeed,
  useSyncCalendarFeed,
  useRemoveCalendarFeed,
} from "../hooks/useProviders";
import ProviderCalendarFeeds from "./ProviderCalendarFeeds";

let addMutate, syncMutate, removeMutate;

function setFeeds(data) {
  useProviderCalendarFeeds.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    error: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  addMutate = vi.fn();
  syncMutate = vi.fn();
  removeMutate = vi.fn();
  useAddCalendarFeed.mockReturnValue({ mutate: addMutate, isPending: false });
  useSyncCalendarFeed.mockReturnValue({
    mutate: syncMutate,
    isPending: false,
    variables: undefined,
  });
  useRemoveCalendarFeed.mockReturnValue({ mutate: removeMutate, isPending: false });
  setFeeds([]);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("ProviderCalendarFeeds", () => {
  it("shows the empty state when there are no feeds", () => {
    render(<ProviderCalendarFeeds providerId={3} />);
    expect(screen.getByText("No feeds yet")).toBeInTheDocument();
  });

  it("adds a valid feed and triggers an immediate sync", async () => {
    addMutate.mockImplementation((_url, { onSuccess }) => onSuccess({ id: 9 }));
    render(<ProviderCalendarFeeds providerId={3} />);
    fireEvent.change(screen.getByLabelText("iCal feed URL"), {
      target: { value: "https://cal/p.ics" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add feed/i }));
    await waitFor(() => expect(addMutate).toHaveBeenCalledTimes(1));
    expect(addMutate.mock.calls[0][0]).toBe("https://cal/p.ics");
    expect(syncMutate).toHaveBeenCalledWith(9); // immediate sync of the new feed
  });

  it("lists a feed with its last-synced time and supports refresh + remove", () => {
    setFeeds([
      { id: 1, ics_url: "https://cal/p.ics", last_synced_at: "2026-07-01T10:00:00Z", active: true },
    ]);
    render(<ProviderCalendarFeeds providerId={3} />);
    expect(screen.getByText("https://cal/p.ics")).toBeInTheDocument();
    expect(screen.getByText(/Last synced/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /refresh now/i }));
    expect(syncMutate).toHaveBeenCalledWith(1, expect.anything());

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(window.confirm).toHaveBeenCalled();
    expect(removeMutate).toHaveBeenCalledWith(1, expect.anything());
  });
});

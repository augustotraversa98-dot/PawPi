import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Hooks + toast + navigation are mocked so this isolates the invites list
// rendering and the accept/decline wiring (no DB / react-query / router).
vi.mock("../hooks/useProviders", () => ({
  useMyProviderInvites: vi.fn(),
  useRespondToInvite: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const navigate = vi.fn();
vi.mock("react-router", () => ({
  useNavigate: () => navigate,
}));

import {
  useMyProviderInvites,
  useRespondToInvite,
} from "../hooks/useProviders";
import ProviderInvites from "./ProviderInvites";

const INVITE = {
  id: 5,
  provider_id: 100,
  role: "vet",
  status: "invited",
  created_at: "2026-06-15T00:00:00.000Z",
  provider_name: "Happy Paws",
  provider_type: "vet",
  logo_url: null,
};

let respondMutate;

function setInvites(data, extra = {}) {
  useMyProviderInvites.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    error: null,
    ...extra,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  respondMutate = vi.fn();
  useRespondToInvite.mockReturnValue({
    mutate: respondMutate,
    isPending: false,
    variables: undefined,
  });
  setInvites([INVITE]);
});

describe("ProviderInvites", () => {
  it("renders each invite with provider name, type and offered role", () => {
    render(<ProviderInvites />);
    expect(screen.getByText("Happy Paws")).toBeInTheDocument();
    expect(screen.getByText("invited as")).toBeInTheDocument();
    // provider_type + offered role both read "vet" (type span + role badge).
    expect(screen.getAllByText("vet")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /accept/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /decline/i })).toBeInTheDocument();
  });

  it("shows the empty state when there are no invites", () => {
    setInvites([]);
    render(<ProviderInvites />);
    expect(screen.getByText("No pending invitations")).toBeInTheDocument();
  });

  it("shows the loading state", () => {
    setInvites(undefined, { isLoading: true });
    render(<ProviderInvites />);
    expect(screen.getByText("Loading invitations…")).toBeInTheDocument();
  });

  it("Accept calls respond with the provider id and no decline action", () => {
    render(<ProviderInvites />);
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect(respondMutate).toHaveBeenCalledTimes(1);
    expect(respondMutate.mock.calls[0][0]).toEqual({ providerId: 100 });
  });

  it("Decline calls respond with { action: 'decline' }", () => {
    render(<ProviderInvites />);
    fireEvent.click(screen.getByRole("button", { name: /decline/i }));
    expect(respondMutate).toHaveBeenCalledTimes(1);
    expect(respondMutate.mock.calls[0][0]).toEqual({
      providerId: 100,
      action: "decline",
    });
  });

  it("routes into the dashboard after a successful accept", () => {
    respondMutate.mockImplementation((_vars, { onSuccess }) => onSuccess());
    render(<ProviderInvites />);
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect(navigate).toHaveBeenCalledWith("/provider/bookings");
  });

  it("surfaces a 404 from accept via a toast (does not navigate)", async () => {
    const { toast } = await import("sonner");
    respondMutate.mockImplementation((_vars, { onError }) =>
      onError(
        Object.assign(new Error("No pending invite for this provider"), {
          status: 404,
        }),
      ),
    );
    render(<ProviderInvites />);
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect(toast.error).toHaveBeenCalledWith(
      "No pending invite for this provider",
    );
    expect(navigate).not.toHaveBeenCalled();
  });
});

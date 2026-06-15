import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from "@testing-library/react";

// The data + mutation hooks are mocked so this test isolates rendering, the
// owner protection, the invite form, and the role-change / remove wiring (no
// DB / react-query).
vi.mock("../hooks/useProviders", () => ({
  useProviderStaff: vi.fn(),
  useInviteStaff: vi.fn(),
  useUpdateStaffRole: vi.fn(),
  useRemoveStaff: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import {
  useProviderStaff,
  useInviteStaff,
  useUpdateStaffRole,
  useRemoveStaff,
} from "../hooks/useProviders";
import ProviderStaff from "./ProviderStaff";

const OWNER = {
  id: 1,
  user_profile_id: 7,
  role: "owner",
  status: "active",
  username: "doc",
  full_name: "Dr Vet",
};
const STAFF = {
  id: 2,
  user_profile_id: 8,
  role: "staff",
  status: "active",
  username: "frontdesk",
  full_name: "Front Desk",
};
const INVITED = {
  id: 3,
  user_profile_id: 9,
  role: "vet",
  status: "invited",
  username: "newvet",
  full_name: null,
};

let inviteMutate, updateRoleMutate, removeMutate;

function setStaff(data, extra = {}) {
  useProviderStaff.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    error: null,
    ...extra,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  inviteMutate = vi.fn();
  updateRoleMutate = vi.fn();
  removeMutate = vi.fn();
  useInviteStaff.mockReturnValue({ mutate: inviteMutate, isPending: false });
  useUpdateStaffRole.mockReturnValue({
    mutate: updateRoleMutate,
    isPending: false,
    variables: undefined,
  });
  useRemoveStaff.mockReturnValue({
    mutate: removeMutate,
    isPending: false,
    variables: undefined,
  });
  setStaff([OWNER, STAFF, INVITED]);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("ProviderStaff", () => {
  it("renders members with names, usernames, roles and statuses", () => {
    render(<ProviderStaff providerId={3} />);
    expect(screen.getByText("Dr Vet")).toBeInTheDocument();
    expect(screen.getByText("@doc")).toBeInTheDocument();
    expect(screen.getByText("Front Desk")).toBeInTheDocument();
    expect(screen.getByText("@frontdesk")).toBeInTheDocument();
    // invited member with no full_name falls back to its username.
    expect(screen.getByText("newvet")).toBeInTheDocument();
    expect(screen.getByText("Invited")).toBeInTheDocument();
    // active appears for the active members.
    expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(1);
  });

  it("shows the empty state when there are no members", () => {
    setStaff([]);
    render(<ProviderStaff providerId={3} />);
    expect(screen.getByText("No staff yet")).toBeInTheDocument();
  });

  it("the owner row has no role/remove controls (protected)", () => {
    render(<ProviderStaff providerId={3} />);
    expect(screen.getByText("Owner — protected")).toBeInTheDocument();
    // Only the two non-owner rows expose a Remove button.
    expect(screen.getAllByRole("button", { name: /remove/i })).toHaveLength(2);
    // The owner has no role <select>; only the two non-owner members do.
    expect(screen.getByLabelText(/change role for Front Desk/i)).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/change role for Dr Vet/i),
    ).not.toBeInTheDocument();
  });

  it("Invite posts { username, role } (stripping a leading @)", async () => {
    render(<ProviderStaff providerId={3} />);
    fireEvent.change(screen.getByPlaceholderText("@username"), {
      target: { value: "@bob" },
    });
    fireEvent.change(screen.getByLabelText("Invite role"), {
      target: { value: "admin" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^invite$/i }));

    await waitFor(() => expect(inviteMutate).toHaveBeenCalledTimes(1));
    expect(inviteMutate.mock.calls[0][0]).toEqual({
      username: "bob",
      role: "admin",
    });
  });

  it("changing a member's role calls useUpdateStaffRole with the new role", () => {
    render(<ProviderStaff providerId={3} />);
    fireEvent.change(screen.getByLabelText(/change role for Front Desk/i), {
      target: { value: "admin" },
    });
    expect(updateRoleMutate).toHaveBeenCalledWith(
      { userProfileId: 8, role: "admin" },
      expect.anything(),
    );
  });

  it("Remove confirms then calls useRemoveStaff with the user_profile_id", () => {
    render(<ProviderStaff providerId={3} />);
    // Front Desk is the first non-owner row.
    fireEvent.click(screen.getAllByRole("button", { name: /remove/i })[0]);
    expect(window.confirm).toHaveBeenCalled();
    expect(removeMutate).toHaveBeenCalledWith(8, expect.anything());
  });

  it("surfaces the invite error message via toast", async () => {
    const { toast } = await import("sonner");
    inviteMutate.mockImplementation((_body, opts) =>
      opts.onError(new Error("Invitee not found")),
    );
    render(<ProviderStaff providerId={3} />);
    fireEvent.change(screen.getByPlaceholderText("@username"), {
      target: { value: "ghost" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^invite$/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Invitee not found"),
    );
  });
});

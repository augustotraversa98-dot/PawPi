import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// All three data/mutation hooks are mocked so this isolates the profile screen:
// field rendering, the status toggle, the changed-fields-only save, and the 409
// slug surfacing (no DB / react-query).
vi.mock("../hooks/useProviders", () => ({
  useProvider: vi.fn(),
  useUpdateProviderProfile: vi.fn(),
  useSetProviderStatus: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

import {
  useProvider,
  useUpdateProviderProfile,
  useSetProviderStatus,
} from "../hooks/useProviders";
import ProviderProfile from "./ProviderProfile";

const DRAFT = {
  id: 3,
  name: "Happy Paws",
  provider_type: "vet",
  bio: "We love dogs",
  logo_url: "",
  slug: "happy-paws",
  status: "draft",
};

let updateMutate;
let statusMutate;

function setProvider(provider, extra = {}) {
  useProvider.mockReturnValue({
    data: { provider, staff: [] },
    isLoading: false,
    isError: false,
    error: null,
    ...extra,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  updateMutate = vi.fn();
  statusMutate = vi.fn();
  useUpdateProviderProfile.mockReturnValue({
    mutate: updateMutate,
    isPending: false,
  });
  useSetProviderStatus.mockReturnValue({
    mutate: statusMutate,
    isPending: false,
  });
  setProvider(DRAFT);
});

describe("ProviderProfile", () => {
  it("renders the current fields and the Draft status with a Publish action", () => {
    render(<ProviderProfile providerId={3} />);
    expect(screen.getByDisplayValue("Happy Paws")).toBeInTheDocument();
    expect(screen.getByDisplayValue("happy-paws")).toBeInTheDocument();
    expect(screen.getByDisplayValue("We love dogs")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Publish")).toBeInTheDocument();
  });

  it("shows Published status + the public path and an Unpublish action", () => {
    setProvider({ ...DRAFT, status: "published" });
    render(<ProviderProfile providerId={3} />);
    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(screen.getByText("Unpublish")).toBeInTheDocument();
    expect(screen.getByText("/providers/public/happy-paws")).toBeInTheDocument();
  });

  it("saves only the changed fields via PATCH", async () => {
    render(<ProviderProfile providerId={3} />);
    fireEvent.change(screen.getByDisplayValue("Happy Paws"), {
      target: { value: "Happy Paws Clinic" },
    });
    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() => expect(updateMutate).toHaveBeenCalled());
    expect(updateMutate).toHaveBeenCalledWith(
      { name: "Happy Paws Clinic" },
      expect.any(Object),
    );
  });

  it("publishes via the status toggle", () => {
    render(<ProviderProfile providerId={3} />);
    fireEvent.click(screen.getByText("Publish"));
    expect(statusMutate).toHaveBeenCalledWith("published", expect.any(Object));
  });

  it("surfaces a slug-in-use message inline when the save 409s", async () => {
    // Drive the update hook's onError with a 409 to assert the inline message.
    updateMutate.mockImplementation((_changes, { onError }) =>
      onError(new Error("slug already in use")),
    );
    render(<ProviderProfile providerId={3} />);
    fireEvent.change(screen.getByDisplayValue("happy-paws"), {
      target: { value: "taken-slug" },
    });
    fireEvent.click(screen.getByText("Save changes"));

    expect(
      await screen.findByText("slug already in use"),
    ).toBeInTheDocument();
  });
});

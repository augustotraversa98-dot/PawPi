import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ProviderAdoption (ticket 2.12) — the adoption place's listing + application workspace. The
// data hooks are mocked; we assert: listings render with their status, empty states show,
// creating a listing calls the create mutation, and reviewing an application (approve/decline)
// calls the review mutation with the right status (approval = the pet-transfer trigger).

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// The media uploaders (ticket 2.85) use the shared upload hook; stub it so render is fetch-free.
vi.mock("@/utils/useUpload", () => ({
  __esModule: true,
  default: () => [vi.fn().mockResolvedValue({ url: "https://cdn/x.jpg" }), { loading: false }],
}));
vi.mock("../hooks/useProviders", () => ({
  useAdoptableListings: vi.fn(),
  useCreateAdoptableListing: vi.fn(),
  useUpdateAdoptableListing: vi.fn(),
  useDeleteAdoptableListing: vi.fn(),
  useAdoptionApplications: vi.fn(),
  useReviewAdoptionApplication: vi.fn(),
}));

import {
  useAdoptableListings,
  useCreateAdoptableListing,
  useUpdateAdoptableListing,
  useDeleteAdoptableListing,
  useAdoptionApplications,
  useReviewAdoptionApplication,
} from "../hooks/useProviders";
import ProviderAdoption from "./ProviderAdoption";

const mutationStub = (overrides = {}) => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn().mockResolvedValue({}),
  isPending: false,
  ...overrides,
});

const queryStub = (data, extra = {}) => ({
  data,
  isLoading: false,
  isError: false,
  error: null,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  useCreateAdoptableListing.mockReturnValue(mutationStub());
  useUpdateAdoptableListing.mockReturnValue(mutationStub());
  useDeleteAdoptableListing.mockReturnValue(mutationStub());
  useReviewAdoptionApplication.mockReturnValue(mutationStub());
  useAdoptableListings.mockReturnValue(queryStub([]));
  useAdoptionApplications.mockReturnValue(queryStub([]));
});

describe("ProviderAdoption", () => {
  it("shows empty states when there are no dogs and no applications", () => {
    render(<ProviderAdoption providerId={10} />);
    expect(screen.getByText("No dogs listed yet")).toBeTruthy();
    expect(screen.getByText("No applications yet")).toBeTruthy();
  });

  it("renders a listing with its status tag", () => {
    useAdoptableListings.mockReturnValue(
      queryStub([
        { id: 1, name: "Rex", breed: "Beagle", adoption_fee_cents: 5000, currency: "ARS", status: "available" },
      ]),
    );
    render(<ProviderAdoption providerId={10} />);
    expect(screen.getByText("Rex")).toBeTruthy();
    expect(screen.getByText("Available")).toBeTruthy();
  });

  it("creating a listing calls the create mutation with the name", async () => {
    const create = mutationStub();
    useCreateAdoptableListing.mockReturnValue(create);
    render(<ProviderAdoption providerId={10} />);
    fireEvent.change(screen.getByPlaceholderText("Dog's name"), { target: { value: "Buddy" } });
    fireEvent.click(screen.getByText("List a dog"));
    expect(create.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Buddy", photo_urls: [], video_url: null }),
    );
  });

  it("the cover photo (first photo_url) renders as the listing thumbnail", () => {
    useAdoptableListings.mockReturnValue(
      queryStub([
        {
          id: 1,
          name: "Rex",
          status: "available",
          photo_urls: ["https://cdn/cover.jpg", "https://cdn/2.jpg"],
          video_url: "https://cdn/v.mp4",
        },
      ]),
    );
    render(<ProviderAdoption providerId={10} />);
    expect(screen.getByAltText("Rex").getAttribute("src")).toBe("https://cdn/cover.jpg");
    expect(screen.getByText(/2 photos · video/)).toBeTruthy();
  });

  it("editing media opens the modal and saves photo_urls + video_url via update", () => {
    const update = mutationStub();
    useUpdateAdoptableListing.mockReturnValue(update);
    useAdoptableListings.mockReturnValue(
      queryStub([
        { id: 5, name: "Rex", status: "available", photo_urls: ["https://cdn/a.jpg"], video_url: null },
      ]),
    );
    render(<ProviderAdoption providerId={10} />);
    fireEvent.click(screen.getByText("Media"));
    expect(screen.getByText("Photos & video — Rex")).toBeTruthy();
    fireEvent.click(screen.getByText("Save media"));
    expect(update.mutate).toHaveBeenCalledWith(
      { listingId: 5, photo_urls: ["https://cdn/a.jpg"], video_url: null },
      expect.anything(),
    );
  });

  it("approving an application calls review with status=approved (the transfer trigger)", () => {
    const review = mutationStub();
    useReviewAdoptionApplication.mockReturnValue(review);
    useAdoptionApplications.mockReturnValue(
      queryStub([
        {
          id: 7,
          listing_name: "Rex",
          applicant_name: "Augusto",
          applicant_owner_user_id: 1,
          answers: {},
          status: "submitted",
        },
      ]),
    );
    render(<ProviderAdoption providerId={10} />);
    fireEvent.click(screen.getByText("Approve"));
    expect(review.mutateAsync).toHaveBeenCalledWith({ applicationId: 7, status: "approved" });
  });

  it("declining an application calls review with status=declined", () => {
    const review = mutationStub();
    useReviewAdoptionApplication.mockReturnValue(review);
    useAdoptionApplications.mockReturnValue(
      queryStub([
        { id: 8, listing_name: "Rex", applicant_name: "Augusto", applicant_owner_user_id: 1, answers: {}, status: "submitted" },
      ]),
    );
    render(<ProviderAdoption providerId={10} />);
    fireEvent.click(screen.getByText("Decline"));
    expect(review.mutateAsync).toHaveBeenCalledWith({ applicationId: 8, status: "declined" });
  });
});

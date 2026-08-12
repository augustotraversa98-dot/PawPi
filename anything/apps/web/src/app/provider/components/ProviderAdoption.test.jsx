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

  it("editing a listing prefills its info + media and saves the whole set via update (2.91)", () => {
    const update = mutationStub();
    useUpdateAdoptableListing.mockReturnValue(update);
    useAdoptableListings.mockReturnValue(
      queryStub([
        {
          id: 5,
          name: "Rex",
          breed: "Beagle",
          adoption_fee_cents: 5000,
          story: "A gentle boy",
          status: "available",
          photo_urls: ["https://cdn/a.jpg"],
          video_url: null,
        },
      ]),
    );
    render(<ProviderAdoption providerId={10} />);
    fireEvent.click(screen.getByText("Edit"));

    // The modal opens PREFILLED with the info the business wrote (previously unreachable).
    expect(screen.getByText("Edit Rex")).toBeTruthy();
    expect(screen.getByDisplayValue("Beagle")).toBeTruthy();
    expect(screen.getByDisplayValue("50")).toBeTruthy(); // 5000 cents -> "50"
    expect(screen.getByDisplayValue("A gentle boy")).toBeTruthy();

    // Change the story and re-save — the whole set (info + media) persists via PATCH.
    fireEvent.change(screen.getByDisplayValue("A gentle boy"), {
      target: { value: "A gentle, house-trained boy" },
    });
    fireEvent.click(screen.getByText("Save changes"));
    expect(update.mutate).toHaveBeenCalledWith(
      {
        listingId: 5,
        name: "Rex",
        breed: "Beagle",
        // No age was stored on this fixture → the (empty) age inputs save as null.
        age_years: null,
        age_months: null,
        adoption_fee_cents: 5000,
        story: "A gentle, house-trained boy",
        status: "available",
        photo_urls: ["https://cdn/a.jpg"],
        video_url: null,
      },
      expect.anything(),
    );
  });

  it("creating a listing sends the entered age (years + months)", () => {
    const create = mutationStub();
    useCreateAdoptableListing.mockReturnValue(create);
    render(<ProviderAdoption providerId={10} />);
    fireEvent.change(screen.getByPlaceholderText("Dog's name"), { target: { value: "Buddy" } });
    fireEvent.change(screen.getByLabelText("Age in years"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Extra months"), { target: { value: "6" } });
    fireEvent.click(screen.getByText("List a dog"));
    expect(create.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Buddy", age_years: 3, age_months: 6 }),
    );
  });

  it("an empty age creates the listing with null age (genuinely unknown)", () => {
    const create = mutationStub();
    useCreateAdoptableListing.mockReturnValue(create);
    render(<ProviderAdoption providerId={10} />);
    fireEvent.change(screen.getByPlaceholderText("Dog's name"), { target: { value: "Buddy" } });
    fireEvent.click(screen.getByText("List a dog"));
    expect(create.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ age_years: null, age_months: null }),
    );
  });

  it("rejects an invalid months value client-side (no mutation fired)", () => {
    const create = mutationStub();
    useCreateAdoptableListing.mockReturnValue(create);
    render(<ProviderAdoption providerId={10} />);
    fireEvent.change(screen.getByPlaceholderText("Dog's name"), { target: { value: "Buddy" } });
    fireEvent.change(screen.getByLabelText("Extra months"), { target: { value: "13" } });
    fireEvent.click(screen.getByText("List a dog"));
    expect(create.mutateAsync).not.toHaveBeenCalled();
  });

  it("the edit modal PREFILLS the stored age and saves the edited value", () => {
    const update = mutationStub();
    useUpdateAdoptableListing.mockReturnValue(update);
    useAdoptableListings.mockReturnValue(
      queryStub([
        {
          id: 9,
          name: "Rex",
          breed: "Beagle",
          age_years: 2,
          age_months: 3,
          adoption_fee_cents: 0,
          status: "available",
          photo_urls: [],
          video_url: null,
        },
      ]),
    );
    render(<ProviderAdoption providerId={10} />);
    fireEvent.click(screen.getByText("Edit"));
    // Prefilled from the stored age.
    expect(screen.getByDisplayValue("2")).toBeTruthy();
    expect(screen.getByDisplayValue("3")).toBeTruthy();
    // Change the years and save.
    fireEvent.change(screen.getByDisplayValue("2"), { target: { value: "4" } });
    fireEvent.click(screen.getByText("Save changes"));
    expect(update.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ listingId: 9, age_years: 4, age_months: 3 }),
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

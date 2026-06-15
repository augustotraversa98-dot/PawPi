import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// The create mutation is mocked so this isolates form rendering, client
// validation, and the submit payload (no DB / react-query).
vi.mock("../hooks/useProviders", () => ({
  useCreateProvider: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useCreateProvider } from "../hooks/useProviders";
import CreateProviderForm from "./CreateProviderForm";

let mutateMock;

beforeEach(() => {
  vi.clearAllMocks();
  mutateMock = vi.fn();
  useCreateProvider.mockReturnValue({ mutate: mutateMock, isPending: false });
});

describe("CreateProviderForm (onboarding)", () => {
  it("renders the create form fields", () => {
    render(<CreateProviderForm />);
    expect(screen.getByText("Create your provider")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Happy Paws Veterinary"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Provider type")).toBeInTheDocument();
  });

  it("submits the entered fields via useCreateProvider", async () => {
    render(<CreateProviderForm />);
    fireEvent.change(screen.getByPlaceholderText("Happy Paws Veterinary"), {
      target: { value: "New Vet" },
    });
    fireEvent.change(screen.getByLabelText("Provider type"), {
      target: { value: "vet" },
    });
    fireEvent.click(screen.getByText("Create provider"));

    await waitFor(() => expect(mutateMock).toHaveBeenCalled());
    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New Vet", provider_type: "vet" }),
      expect.any(Object),
    );
  });

  it("does NOT submit when required fields are missing", async () => {
    render(<CreateProviderForm />);
    fireEvent.click(screen.getByText("Create provider"));

    // client validation blocks the submit → no mutate, and the errors render.
    expect(
      await screen.findByText("Business name is required"),
    ).toBeInTheDocument();
    expect(mutateMock).not.toHaveBeenCalled();
  });
});

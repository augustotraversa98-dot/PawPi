import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// DocumentCatalogImport (ticket 2.82) — the confirm-first review panel. Proves: an upload triggers
// the document-enrich call; the proposed catalog renders editable rows; Apply routes through the
// EXISTING service/product CRUD hooks (not a direct write); Skip drops a row. Hooks + upload mocked.

vi.mock("../hooks/useProviders", () => ({
  useEnrichProviderDocument: vi.fn(),
  useCreateService: vi.fn(),
  useCreateShopProduct: vi.fn(),
}));
vi.mock("@/utils/useUpload", () => ({ default: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import {
  useEnrichProviderDocument,
  useCreateService,
  useCreateShopProduct,
} from "../hooks/useProviders";
import useUpload from "@/utils/useUpload";
import DocumentCatalogImport from "./DocumentCatalogImport";

let enrichMutate, createServiceMutate, createProductMutate, uploadFn;

beforeEach(() => {
  vi.clearAllMocks();
  enrichMutate = vi.fn();
  createServiceMutate = vi.fn();
  createProductMutate = vi.fn();
  uploadFn = vi.fn().mockResolvedValue({ url: "https://store/menu.xlsx" });
  useEnrichProviderDocument.mockReturnValue({
    mutate: enrichMutate,
    isPending: false,
  });
  useCreateService.mockReturnValue({ mutate: createServiceMutate, isPending: false });
  useCreateShopProduct.mockReturnValue({
    mutate: createProductMutate,
    isPending: false,
  });
  useUpload.mockReturnValue([uploadFn, { loading: false }]);
});

function uploadFile() {
  const input = screen.getByLabelText("Upload price list or menu");
  const file = new File(["x"], "menu.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  fireEvent.change(input, { target: { files: [file] } });
}

const DRAFT = {
  draft: {
    services: [{ name: "Bath", price: "20", duration: "30", description: "warm" }],
    products: [{ name: "Shampoo", price: "12" }],
  },
};

describe("DocumentCatalogImport", () => {
  it("uploads then enriches, and renders the proposed catalog rows", async () => {
    enrichMutate.mockImplementation((_file, { onSuccess }) => onSuccess(DRAFT));
    render(<DocumentCatalogImport providerId={3} />);
    fireEvent.click(screen.getByText("Import from a price list or menu"));
    uploadFile();

    await waitFor(() => expect(enrichMutate).toHaveBeenCalledTimes(1));
    expect(uploadFn).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue("Bath")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Shampoo")).toBeInTheDocument();
  });

  it("Apply on a service routes through useCreateService with parsed cents/minutes", async () => {
    enrichMutate.mockImplementation((_file, { onSuccess }) => onSuccess(DRAFT));
    render(<DocumentCatalogImport providerId={3} />);
    fireEvent.click(screen.getByText("Import from a price list or menu"));
    uploadFile();
    await waitFor(() => expect(screen.getByDisplayValue("Bath")).toBeInTheDocument());

    fireEvent.click(screen.getAllByText("Apply")[0]);
    expect(createServiceMutate).toHaveBeenCalledTimes(1);
    expect(createServiceMutate.mock.calls[0][0]).toEqual({
      name: "Bath",
      description: "warm",
      price_cents: 2000,
      duration_min: 30,
    });
  });

  it("shows a clean not-set-up message on a 503", async () => {
    enrichMutate.mockImplementation((_file, { onError }) =>
      onError({ status: 503, message: "Enrichment isn't set up yet" }),
    );
    render(<DocumentCatalogImport providerId={3} />);
    fireEvent.click(screen.getByText("Import from a price list or menu"));
    uploadFile();
    expect(
      await screen.findByText(/isn.t set up yet/i),
    ).toBeInTheDocument();
  });
});

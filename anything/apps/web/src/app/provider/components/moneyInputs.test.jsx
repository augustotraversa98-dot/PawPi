import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

// Every money field of the panel, in a Spanish (es-AR) browser: "49,90" reaches the API as 4990 cents, a stored
// 4990 is written back as "49,90", and an unreadable amount is refused with a visible message instead of cut off.
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }));
const upload = vi.hoisted(() => vi.fn());
vi.mock("@/utils/useUpload", () => ({ default: () => [upload, { loading: false }] }));
vi.mock("./ImageUploader", () => ({ default: () => null }));
vi.mock("./VideoUploader", () => ({ default: () => null }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ getQueryData: () => undefined, setQueryData: () => {}, invalidateQueries: () => {} }),
}));
const hooks = vi.hoisted(() =>
  Object.fromEntries(
    [
      "useProviderServices",
      "useCreateService",
      "useUpdateService",
      "useDeactivateService",
      "useProviderCapabilities",
      "useAddCapability",
      "useShopProducts",
      "useCreateShopProduct",
      "useUpdateShopProduct",
      "useDeleteShopProduct",
      "useShopOrders",
      "useSetOrderFulfillment",
      "useAdoptableListings",
      "useCreateAdoptableListing",
      "useUpdateAdoptableListing",
      "useDeleteAdoptableListing",
      "useRelistAdoptableListing",
      "useAdoptionApplications",
      "useReviewAdoptionApplication",
      "useOpenAdoptionApplicantThread",
      "useWalkPackages",
      "useCreateWalkPackage",
      "useUpdateWalkPackage",
      "useDeactivateWalkPackage",
      "useProviderRxFulfillment",
      "useRxFulfillmentAction",
      "useProviderInsurancePolicies",
      "useInsurancePolicyAction",
      "useEnrichProviderDocument",
      "useProvider",
      "useProviderPosts",
      "useProviderLocations",
      "useSetStorefrontLayout",
      "useReorderShopProducts",
      "useReorderServices",
    ].map((name) => [name, vi.fn()]),
  ),
);
vi.mock("../hooks/useProviders", () => ({
  ...hooks,
  providerKey: (id) => ["provider", String(id)],
  shopProductsKey: (id) => ["provider", id, "shop-products"],
  servicesKey: (id) => ["provider-services", String(id)],
}));

import { toast } from "sonner";
import DocumentCatalogImport from "./DocumentCatalogImport";
import InsurancePolicies from "./InsurancePolicies";
import PharmacyQueue from "./PharmacyQueue";
import ProviderAdoption from "./ProviderAdoption";
import ProviderServices from "./ProviderServices";
import ProviderShop from "./ProviderShop";
import ProviderWalkPackages from "./ProviderWalkPackages";
import StorefrontEditor from "./StorefrontEditor";

const INVALID = "Ingresá un importe válido (por ejemplo, 12,50 o 1.250,00)";
const query = (data) => ({ data, isLoading: false, isError: false, error: null });
const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false });
// Each write hook hands back the same object on every render, so its calls can be read.
function writes(name) {
  const stub = mutation();
  hooks[name].mockReturnValue(stub);
  return stub;
}
const type = (field, value) => fireEvent.change(field, { target: { value } });
const click = (name) => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState(null, "", "/provider");
  vi.spyOn(window.navigator, "languages", "get").mockReturnValue(["es-AR", "es"]);
  for (const hook of Object.values(hooks)) hook.mockReturnValue(mutation());
  for (const name of [
    "useProviderServices",
    "useShopProducts",
    "useShopOrders",
    "useAdoptableListings",
    "useAdoptionApplications",
    "useWalkPackages",
    "useProviderPosts",
    "useProviderLocations",
  ]) {
    hooks[name].mockReturnValue(query([]));
  }
  hooks.useProviderCapabilities.mockReturnValue(query(["shop"]));
});
afterEach(() => vi.restoreAllMocks());

describe("services", () => {
  const dialog = () => screen.getByRole("dialog");
  const fields = () => ({
    price: within(dialog()).getByPlaceholderText("50,00"),
    deposit: within(dialog()).getByPlaceholderText("0,00"),
    nightly: within(dialog()).getByPlaceholderText("40,00"),
  });

  it("sends price, deposit and nightly rate typed with a comma as cents", async () => {
    const create = writes("useCreateService");
    render(<ProviderServices providerId={3} />);
    click("Agregar servicio");
    type(within(dialog()).getAllByRole("textbox")[0], "Baño");
    type(fields().price, "49,90");
    type(fields().deposit, "1.234,56");
    type(fields().nightly, "1.500");
    fireEvent.submit(dialog().querySelector("form"));

    await waitFor(() => expect(create.mutate).toHaveBeenCalledTimes(1));
    expect(create.mutate.mock.calls[0][0]).toMatchObject({
      price_cents: 4990,
      deposit_cents: 123456,
      nightly_rate_cents: 150000,
    });
  });

  it("shows a stored price with a comma and saves it unchanged", async () => {
    const update = writes("useUpdateService");
    hooks.useProviderServices.mockReturnValue(
      query([{ id: 1, name: "Baño", price_cents: 4990, active: true }]),
    );
    render(<ProviderServices providerId={3} />);
    expect(screen.getByText(/^\$\s49,90$/)).toBeInTheDocument();
    click("Editar");
    expect(fields().price).toHaveValue("49,90");
    fireEvent.submit(dialog().querySelector("form"));

    await waitFor(() => expect(update.mutate).toHaveBeenCalledTimes(1));
    expect(update.mutate.mock.calls[0][0]).toMatchObject({ serviceId: 1, price_cents: 4990 });
  });

  it("refuses an unreadable price with a message and saves nothing", async () => {
    const create = writes("useCreateService");
    render(<ProviderServices providerId={3} />);
    click("Agregar servicio");
    type(within(dialog()).getAllByRole("textbox")[0], "Baño");
    type(fields().price, "49,905");
    fireEvent.submit(dialog().querySelector("form"));

    expect(await screen.findByText(INVALID)).toBeInTheDocument();
    expect(create.mutate).not.toHaveBeenCalled();
  });
});

describe("products", () => {
  const submit = (price) => {
    type(screen.getByPlaceholderText("Nombre del producto"), "Alimento");
    type(screen.getByPlaceholderText("Precio (por ejemplo, 49,90)"), price);
    fireEvent.submit(screen.getByPlaceholderText("Nombre del producto").closest("form"));
  };

  it.each([
    ["49,90", 4990],
    ["$ 1.234,56", 123456],
  ])("sends %j as %i cents", async (price, cents) => {
    const create = writes("useCreateShopProduct");
    render(<ProviderShop providerId={3} />);
    submit(price);
    await waitFor(() => expect(create.mutateAsync).toHaveBeenCalledTimes(1));
    expect(create.mutateAsync.mock.calls[0][0].price_cents).toBe(cents);
  });

  it("refuses an unreadable price", () => {
    const create = writes("useCreateShopProduct");
    render(<ProviderShop providerId={3} />);
    submit("49,90 aprox");
    expect(toast.error).toHaveBeenCalledWith(INVALID);
    expect(create.mutateAsync).not.toHaveBeenCalled();
  });
});

describe("adoption fee", () => {
  const dog = { id: 5, name: "Rex", status: "available", adoption_fee_cents: 4990, currency: "ARS", photo_urls: [] };
  const create = (fee) => {
    type(screen.getByPlaceholderText("Nombre del perro"), "Rex");
    type(screen.getByPlaceholderText("Costo de adopción (por ejemplo, 50,00; vacío = gratis)"), fee);
    fireEvent.submit(screen.getByPlaceholderText("Nombre del perro").closest("form"));
  };

  it.each([
    ["49,90", 4990],
    ["", 0],
  ])("creates a listing: %j → %i cents", async (fee, cents) => {
    const stub = writes("useCreateAdoptableListing");
    render(<ProviderAdoption providerId={10} />);
    create(fee);
    await waitFor(() => expect(stub.mutateAsync).toHaveBeenCalledTimes(1));
    expect(stub.mutateAsync.mock.calls[0][0].adoption_fee_cents).toBe(cents);
  });

  it("never lists a dog with an unreadable fee (it used to save as free or cut off)", () => {
    const stub = writes("useCreateAdoptableListing");
    render(<ProviderAdoption providerId={10} />);
    create("cincuenta");
    expect(toast.error).toHaveBeenCalledWith(INVALID);
    expect(stub.mutateAsync).not.toHaveBeenCalled();
  });

  it("edits a listing: prefilled with a comma, a comma amount saves as cents", () => {
    const update = writes("useUpdateAdoptableListing");
    hooks.useAdoptableListings.mockReturnValue(query([dog]));
    render(<ProviderAdoption providerId={10} />);
    click("Editar");
    const fee = screen.getByPlaceholderText("por ejemplo, 50,00");
    expect(fee).toHaveValue("49,90");
    type(fee, "75,50");
    click("Guardar cambios");
    expect(update.mutate.mock.calls[0][0].adoption_fee_cents).toBe(7550);
  });

  it("keeps the edit open on an unreadable fee", () => {
    const update = writes("useUpdateAdoptableListing");
    hooks.useAdoptableListings.mockReturnValue(query([dog]));
    render(<ProviderAdoption providerId={10} />);
    click("Editar");
    type(screen.getByPlaceholderText("por ejemplo, 50,00"), "49,905");
    click("Guardar cambios");
    expect(toast.error).toHaveBeenCalledWith(INVALID);
    expect(update.mutate).not.toHaveBeenCalled();
  });
});

describe("walk packages", () => {
  it("sends a pack price typed with a comma as cents", async () => {
    const create = writes("useCreateWalkPackage");
    render(<ProviderWalkPackages providerId={3} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Agregar paquete/ })[0]);
    type(screen.getByPlaceholderText("10"), "10");
    type(screen.getByPlaceholderText("90,00"), "49,90");
    fireEvent.submit(screen.getByRole("dialog").querySelector("form"));
    await waitFor(() => expect(create.mutate).toHaveBeenCalledTimes(1));
    expect(create.mutate.mock.calls[0][0]).toEqual({ walks_count: 10, price_cents: 4990 });
  });
});

describe("pharmacy price", () => {
  const order = { id: 1, status: "accepted", method: "pickup", refills_remaining: 1, price_cents: 4990 };

  it("is prefilled with a comma and saved as cents", () => {
    const action = writes("useRxFulfillmentAction");
    hooks.useProviderRxFulfillment.mockReturnValue(query({ orders: [order] }));
    render(<PharmacyQueue providerId={1} />);
    const price = screen.getByPlaceholderText("0,00");
    expect(price).toHaveValue("49,90");
    type(price, "1.049,90");
    click("Guardar precio");
    expect(action.mutate.mock.calls[0][0]).toEqual({ orderId: 1, price_cents: 104990 });
  });
});

describe("insurance premium", () => {
  it("is prefilled with a comma and saved as cents", () => {
    const action = writes("useInsurancePolicyAction");
    hooks.useProviderInsurancePolicies.mockReturnValue(
      query({ policies: [{ id: 1, status: "applied", premium_cents: 4990 }] }),
    );
    render(<InsurancePolicies providerId={1} />);
    const premium = screen.getByPlaceholderText("0,00");
    expect(premium).toHaveValue("49,90");
    type(premium, "59,90");
    click("Emitir / actualizar");
    expect(action.mutate.mock.calls[0][0]).toMatchObject({ policyId: 1, premium_cents: 5990 });
  });
});

describe("storefront compare-at price", () => {
  function setup(product) {
    const update = writes("useUpdateShopProduct");
    hooks.useProvider.mockReturnValue(
      query({ provider: { id: 100, name: "Tienda", status: "published" }, capabilities: ["shop"] }),
    );
    hooks.useShopProducts.mockReturnValue(
      query([{ id: 1, name: "Alimento", price_cents: 4000, currency: "ARS", image_urls: [], compare_at_cents: null, ...product }]),
    );
    render(<StorefrontEditor providerId={100} />);
    return { update, field: screen.getByTestId("product-sale-1"), save: screen.getByTestId("storefront-save") };
  }

  it("typed key by key, '49,90' saves 4990 cents (it used to keep 49)", async () => {
    const { update, field, save } = setup();
    for (const value of ["4", "49", "49,", "49,9", "49,90"]) type(field, value);
    expect(screen.queryByTestId("product-sale-error-1")).toBeNull();
    fireEvent.click(save);
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledWith({ productId: 1, compare_at_cents: 4990 }));
  });

  it("shows an unreadable amount and blocks Save instead of keeping the readable part", () => {
    const { field, save } = setup();
    for (const value of ["49", "49,905"]) type(field, value);
    expect(screen.getByTestId("product-sale-error-1")).toHaveTextContent(INVALID);
    expect(save).toBeDisabled();
  });

  it("is prefilled with a comma", () => {
    const { field } = setup({ compare_at_cents: 4990 });
    expect(field).toHaveValue("49,90");
  });
});

describe("price-list import", () => {
  it("applies comma prices from a file, as text or as a spreadsheet number", async () => {
    const service = writes("useCreateService");
    const product = writes("useCreateShopProduct");
    upload.mockResolvedValue({ url: "https://cdn/menu.csv" });
    hooks.useEnrichProviderDocument.mockReturnValue({
      isPending: false,
      mutate: vi.fn((_, options) =>
        options.onSuccess({
          draft: {
            services: [{ name: "Baño", price: "$ 49,90", duration: "30" }],
            products: [{ name: "Shampoo", price: 49.9 }],
          },
        }),
      ),
    });
    render(<DocumentCatalogImport providerId={3} />);
    fireEvent.click(screen.getByText("Importar desde una lista de precios o un menú"));
    fireEvent.change(screen.getByLabelText("Subir una lista de precios o un menú"), {
      target: { files: [new File(["x"], "menu.csv", { type: "text/csv" })] },
    });
    await screen.findByDisplayValue("Shampoo");
    expect(screen.getByDisplayValue("49,90")).toBeInTheDocument();

    const apply = screen.getAllByRole("button", { name: "Aplicar" });
    fireEvent.click(apply[0]);
    fireEvent.click(apply[1]);
    expect(service.mutate.mock.calls[0][0].price_cents).toBe(4990);
    expect(product.mutate.mock.calls[0][0].price_cents).toBe(4990);
  });
});

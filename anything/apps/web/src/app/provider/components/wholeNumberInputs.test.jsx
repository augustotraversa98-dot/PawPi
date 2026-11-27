import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// Whole-number fields of the panel, in a Spanish (es-AR) browser: "1,5" and "1.000" are refused with a message
// instead of being saved as 1.
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("./ImageUploader", () => ({ default: () => null }));
vi.mock("./VideoUploader", () => ({ default: () => null }));
const hooks = vi.hoisted(() =>
  Object.fromEntries(
    [
      "useShopProducts",
      "useCreateShopProduct",
      "useUpdateShopProduct",
      "useDeleteShopProduct",
      "useShopOrders",
      "useSetOrderFulfillment",
      "useProviderCapabilities",
      "useAddCapability",
      "useWalkPackages",
      "useCreateWalkPackage",
      "useUpdateWalkPackage",
      "useDeactivateWalkPackage",
      "useTrainingSessions",
      "useCreateTrainingSession",
      "useTrainingProgress",
      "useLogTrainingProgress",
    ].map((name) => [name, vi.fn()]),
  ),
);
vi.mock("../hooks/useProviders", () => ({ ...hooks }));

import { toast } from "sonner";
import ProviderShop from "./ProviderShop";
import ProviderTraining from "./ProviderTraining";
import ProviderWalkPackages from "./ProviderWalkPackages";

const query = (data) => ({ data, isLoading: false, isError: false, error: null });
const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false });
function writes(name) {
  const stub = mutation();
  hooks[name].mockReturnValue(stub);
  return stub;
}
const type = (field, value) => fireEvent.change(field, { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState(null, "", "/provider");
  vi.spyOn(window.navigator, "languages", "get").mockReturnValue(["es-AR", "es"]);
  for (const hook of Object.values(hooks)) hook.mockReturnValue(mutation());
  for (const name of ["useShopProducts", "useShopOrders", "useWalkPackages", "useTrainingSessions"]) {
    hooks[name].mockReturnValue(query([]));
  }
  hooks.useProviderCapabilities.mockReturnValue(query(["shop"]));
});
afterEach(() => vi.restoreAllMocks());

describe("product stock", () => {
  const add = (stock) => {
    type(screen.getByPlaceholderText("Nombre del producto"), "Alimento");
    type(screen.getByPlaceholderText("Precio (por ejemplo, 49,90)"), "49,90");
    type(screen.getByPlaceholderText("Cantidad en stock"), stock);
    fireEvent.submit(screen.getByPlaceholderText("Nombre del producto").closest("form"));
  };

  it.each(["1,5", "1.000", "diez"])("refuses %j", (stock) => {
    const create = writes("useCreateShopProduct");
    render(<ProviderShop providerId={3} />);
    add(stock);
    expect(toast.error).toHaveBeenCalledWith("La cantidad en stock tiene que ser un número entero, sin comas ni puntos.");
    expect(create.mutateAsync).not.toHaveBeenCalled();
  });

  it.each([
    ["12", 12],
    ["", 0],
  ])("sends %j as %i", async (stock, sent) => {
    const create = writes("useCreateShopProduct");
    render(<ProviderShop providerId={3} />);
    add(stock);
    await waitFor(() => expect(create.mutateAsync).toHaveBeenCalledTimes(1));
    expect(create.mutateAsync.mock.calls[0][0].stock_qty).toBe(sent);
  });
});

describe("walks in a package", () => {
  it.each(["1,5", "1.000", "0"])("refuses %j", async (walks) => {
    const create = writes("useCreateWalkPackage");
    render(<ProviderWalkPackages providerId={3} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Agregar paquete/ })[0]);
    type(screen.getByPlaceholderText("10"), walks);
    type(screen.getByPlaceholderText("90,00"), "90");
    fireEvent.submit(screen.getByRole("dialog").querySelector("form"));
    await waitFor(() =>
      expect(
        screen.getByText("La cantidad de paseos tiene que ser un número entero mayor que cero"),
      ).toBeInTheDocument(),
    );
    expect(create.mutate).not.toHaveBeenCalled();
  });
});

describe("class capacity", () => {
  it.each(["1,5", "1.000", "0"])("refuses %j", (capacity) => {
    const create = writes("useCreateTrainingSession");
    render(<ProviderTraining providerId={3} />);
    const title = screen.getByPlaceholderText(/Título/);
    type(title, "Clase");
    type(screen.getByPlaceholderText("Cupo"), capacity);
    fireEvent.submit(title.closest("form"));
    expect(toast.error).toHaveBeenCalledWith("El cupo tiene que ser un número mayor que cero");
    expect(create.mutateAsync).not.toHaveBeenCalled();
  });
});

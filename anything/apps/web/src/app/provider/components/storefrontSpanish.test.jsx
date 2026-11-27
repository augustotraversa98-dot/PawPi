import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

// The storefront, profile, services, products and locations screens for a Spanish browser. The English wording is
// pinned by each component's own test.
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
const upload = vi.hoisted(() => vi.fn());
vi.mock("@/utils/useUpload", () => ({ default: () => [upload, { loading: false }] }));

import { toast } from "sonner";
import ProviderStorefront from "./ProviderStorefront";
import ProviderProfile from "./ProviderProfile";
import ProviderServices from "./ProviderServices";
import ProviderShop from "./ProviderShop";
import ProviderLocations from "./ProviderLocations";
import { getProviderQueryClient } from "../lib/queryClient";
import { validateCompareAt } from "../lib/storefrontEditor";
import { resetVisitorLang, setVisitorLang } from "../../../lib/publicPet/langStore";

// Answers the panel's reads by "METHOD url-ending"; anything not listed is an empty object.
function serve(routes) {
  global.fetch = vi.fn((url, init) => {
    const path = String(url).split("?")[0];
    const method = init?.method ?? "GET";
    const hit = Object.entries(routes).find(([route]) => {
      const [verb, ending] = route.split(" ");
      return verb === method && path.endsWith(ending);
    });
    const { status = 200, body = {} } = hit?.[1]?.status ? hit[1] : { body: hit?.[1] };
    return Promise.resolve({ ok: status < 400, status, json: async () => body });
  });
}

const show = (node) =>
  render(<QueryClientProvider client={getProviderQueryClient()}>{node}</QueryClientProvider>);

const PROVIDER = {
  id: 1,
  name: "Patitas",
  provider_type: "vet",
  status: "draft",
  slug: "patitas",
  avg_rating: 4.5,
  review_count: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetVisitorLang();
  getProviderQueryClient().clear();
  getProviderQueryClient().setDefaultOptions({ queries: { retry: false } });
  window.history.replaceState(null, "", "/provider");
  vi.spyOn(window.navigator, "languages", "get").mockReturnValue(["es-AR", "es"]);
});
afterEach(() => vi.restoreAllMocks());

describe("storefront in Spanish", () => {
  const routes = {
    "GET /api/providers/1": { provider: PROVIDER, capabilities: ["vet", "shop"] },
    "GET /posts": { posts: [{ id: 9, body: "Hola", image_urls: ["https://example.test/a.jpg"] }] },
    "GET /services": {
      services: [{ id: 7, name: "Control", price_cents: 150000, duration_min: 30, active: false }],
    },
    "GET /shop-products": {
      products: [
        { id: 3, name: "Alimento", price_cents: 5000, currency: "ARS", stock_qty: 4, image_urls: [] },
      ],
    },
    "GET /locations": {
      locations: [{ id: 2, name: "Centro", hours_json: { mon: "closed" } }],
    },
    "GET /reviews": { reviews: [{ id: 1, rating: 5, pet_name: "Mango" }] },
  };

  it("composes, lists and deletes posts, translating a refused request", async () => {
    serve({
      ...routes,
      "DELETE /posts/9": { status: 404, body: { error: "Post not found" } },
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    show(<ProviderStorefront providerId={1} />);

    expect(await screen.findByText("Hola")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Vidriera" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver como cliente" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Publicaciones" })).toBeInTheDocument();
    expect(screen.getByAltText("Imagen 1 de la publicación 9")).toBeInTheDocument();
    expect(screen.getByText("Video (opcional)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Agregá un texto, una foto o un video."),
    );

    fireEvent.click(screen.getByRole("button", { name: "Eliminar la publicación" }));
    expect(confirm).toHaveBeenCalledWith(
      "¿Eliminar esta publicación? Va a desaparecer de tu vidriera.",
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("No encontramos la publicación."));
  });

  it("previews the store and edits its layout", async () => {
    serve(routes);
    show(<ProviderStorefront providerId={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver como cliente" }));

    expect(
      await screen.findByText("Vista previa del borrador · así van a ver tu tienda tus clientes cuando la publiques"),
    ).toBeInTheDocument();
    for (const name of ["Servicios", "Productos", "Publicaciones", "Reseñas", "Ubicaciones", "Información"]) {
      expect(await screen.findByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByText("Veterinaria")).toBeInTheDocument();
    expect(screen.getByText("Tienda")).toBeInTheDocument();
    expect(screen.getByText("desde $1.500")).toBeInTheDocument();
    expect(screen.getByText("4,5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Servicios" }));
    expect(screen.getByText("Oculto")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reseñas" }));
    expect(await screen.findByText("Dueño de mascota")).toBeInTheDocument();
    expect(screen.getByText("con Mango")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Editar la vidriera" }));
    expect(await screen.findByText("Editando la vidriera")).toBeInTheDocument();
    expect(screen.getByText("Secciones: arrastralas para ordenarlas")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Productos" }));
    expect(screen.getByRole("button", { name: "Arrastrar Productos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Destacar el producto" })).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("product-sale-3"), { target: { value: "40" } });
    expect(screen.getByTestId("product-sale-error-3")).toHaveTextContent(
      "El precio anterior tiene que ser mayor que el precio actual",
    );
    act(() => setVisitorLang("en"));
    expect(screen.getByTestId("product-sale-error-3")).toHaveTextContent(
      "Compare-at price must be higher than the current price",
    );
  });

  it("words the compare-at errors in the language asked for, English by default", () => {
    expect(validateCompareAt(0, 5000)).toBe("Enter a valid amount");
    expect(validateCompareAt(0, 5000, "es")).toBe("Ingresá un importe válido");
  });
});

describe("profile in Spanish", () => {
  const routes = {
    "GET /api/providers/1": { provider: PROVIDER, capabilities: ["vet"] },
    "GET /capabilities": { capabilities: ["vet"] },
  };

  it("names the sections, offerings and form, and imports a draft", async () => {
    serve({
      ...routes,
      "POST /enrich": {
        draft: { address: "Calle 1", photos: ["a", "b"] },
        sources: { website: "failed" },
      },
    });
    show(<ProviderProfile providerId={1} />);

    expect(await screen.findByRole("heading", { name: "Perfil" })).toBeInTheDocument();
    // The offerings arrive with their own request.
    expect(await screen.findByRole("button", { name: "Paseo de perros" })).toBeInTheDocument();
    for (const text of [
      "Borrador",
      "Confirmar automáticamente las reservas nuevas",
      "Qué ofrece este negocio",
      "Veterinaria y salud",
      "Nombre del negocio",
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    for (const name of ["Publicar", "Activar", "Horario de atención", "Enlaces públicos", "Guardar cambios"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("option", { name: "Clínica veterinaria" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Importar desde la web" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Armamos un borrador con tus enlaces. Revisalo y guardá. También encontramos: dirección, 2 fotos. Cargalos en Ubicaciones o Servicios.",
      ),
    );
    expect(toast).toHaveBeenCalledWith(
      "No pudimos leer algunos enlaces: completá esos datos a mano.",
    );
  });

  it("shows form and server errors in Spanish, following the switch", async () => {
    serve({
      ...routes,
      "PATCH /api/providers/1": { status: 409, body: { error: "slug already in use" } },
    });
    show(<ProviderProfile providerId={1} />);
    const name = await screen.findByDisplayValue("Patitas");
    fireEvent.change(screen.getByDisplayValue("patitas"), { target: { value: "otro" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    const taken = "Ese identificador ya está en uso. Elegí otro.";
    expect(await screen.findByText(taken)).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith(taken);

    fireEvent.change(name, { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText("Ingresá el nombre del negocio")).toBeInTheDocument();
    act(() => setVisitorLang("en"));
    expect(screen.getByText("Business name is required")).toBeInTheDocument();
  });

  it("explains a failed load in Spanish", async () => {
    serve({ "GET /api/providers/1": { status: 500, body: { error: "Internal server error" } } });
    show(<ProviderProfile providerId={1} />);
    expect(await screen.findByText("No pudimos cargar este negocio")).toBeInTheDocument();
    expect(
      screen.getByText("Algo falló de nuestro lado. Probá de nuevo en un momento."),
    ).toBeInTheDocument();
  });
});

describe("services in Spanish", () => {
  const service = {
    id: 7,
    name: "Control",
    price_cents: 150000,
    deposit_cents: 1050,
    duration_min: 30,
    active: true,
  };

  it("lists with es-AR money and confirms a deactivation", async () => {
    serve({
      "GET /services": { services: [service] },
      "DELETE /services/7": { status: 500, body: { error: "Failed to delete service" } },
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    show(<ProviderServices providerId={1} />);

    expect(await screen.findByText("Control")).toBeInTheDocument();
    for (const text of ["Servicio", "Duración", "Precio", "Seña", "Estado", "Acciones", "Activo", "30 min"]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByText("$ 1.500,00")).toBeInTheDocument();
    expect(screen.getByText("$ 10,50")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Desactivar" }));
    expect(confirm).toHaveBeenCalledWith(
      "¿Desactivar «Control»? Ya no se va a poder reservar. Los turnos anteriores conservan su servicio y podés reactivarlo cuando quieras.",
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("No pudimos desactivar el servicio"),
    );
  });

  it("shows form errors in Spanish, following the switch", async () => {
    serve({ "GET /services": { services: [] } });
    show(<ProviderServices providerId={1} />);
    expect(await screen.findByText("Todavía no hay servicios")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Agregar servicio" }));

    const dialog = screen.getByRole("dialog", { name: "Agregar servicio" });
    const submit = () =>
      fireEvent.click(within(dialog).getByRole("button", { name: "Agregar servicio" }));
    submit();
    expect(await within(dialog).findByText("Ingresá el nombre del servicio")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByPlaceholderText("Control anual"), {
      target: { value: "Baño" },
    });
    fireEvent.change(within(dialog).getByPlaceholderText("50,00"), { target: { value: "x" } });
    submit();
    expect(
      await within(dialog).findByText("Ingresá un importe válido (por ejemplo, 12,50 o 1.250,00)"),
    ).toBeInTheDocument();
    act(() => setVisitorLang("en"));
    expect(within(dialog).getByText("Enter a valid amount (e.g. 12.50 or 1,250.00)")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("products in Spanish", () => {
  it("offers to turn Products on", async () => {
    serve({ "GET /capabilities": { capabilities: [] } });
    show(<ProviderShop providerId={1} />);
    expect(await screen.findByRole("button", { name: "Activar Productos" })).toBeInTheDocument();
    expect(screen.getByText("Vendé productos a las familias con mascotas")).toBeInTheDocument();
  });

  it("shows the catalog and orders, naming stored order values", async () => {
    serve({
      "GET /capabilities": { capabilities: ["shop"] },
      "GET /shop-products": {
        products: [{ id: 3, name: "Hueso", price_cents: 4990, currency: "ARS", stock_qty: 4, active: true }],
      },
      "GET /shop-orders": {
        orders: [
          { id: 12, amount_cents: 4990, currency: "ARS", status: "paid", fulfillment_status: "placed", items: [] },
        ],
      },
      "PATCH /shop-orders/12": { order: {} },
    });
    show(<ProviderShop providerId={1} />);

    expect(await screen.findByText("Pedido #12")).toBeInTheDocument();
    expect(await screen.findByText("ARS 49,90 · 4 en stock")).toBeInTheDocument();
    expect(screen.getByText("Pago: Pagado · Entrega: Recibido")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Precio (por ejemplo, 49,90)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Agregar producto" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Ingresá un nombre y un precio válido."),
    );
    fireEvent.click(screen.getByRole("button", { name: "Enviado" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Estado de la entrega: Enviado"),
    );
    const [, init] = fetch.mock.calls.find(([, i]) => i?.method === "PATCH");
    expect(JSON.parse(init.body)).toEqual({ fulfillment_status: "shipped" });
  });
});

describe("locations in Spanish", () => {
  it("summarises hours, confirms a delete and checks coordinates", async () => {
    serve({
      "GET /locations": {
        locations: [{ id: 2, name: "", hours_json: { mon: { open: "09:00", close: "17:00" } } }],
      },
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    show(<ProviderLocations providerId={1} />);

    expect(await screen.findByText("Ubicación sin nombre")).toBeInTheDocument();
    expect(screen.getByText("Lun 09:00–17:00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(confirm).toHaveBeenCalledWith(
      "¿Eliminar «esta ubicación» de forma permanente? No se puede deshacer. Los turnos anteriores se conservan, pero dejan de estar vinculados a esta ubicación.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Agregar ubicación" }));
    const dialog = screen.getByRole("dialog", { name: "Agregar ubicación" });
    expect(within(dialog).getByLabelText("Lun: apertura")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Dom: cierre")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByPlaceholderText("40.7128"), { target: { value: "200" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Agregar ubicación" }));
    expect(
      await within(dialog).findByText("La latitud tiene que estar entre -90 y 90"),
    ).toBeInTheDocument();
  });
});

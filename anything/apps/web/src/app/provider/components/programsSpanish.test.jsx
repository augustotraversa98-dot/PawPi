import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

// Adoption, daycare, training, walk packages, pharmacy, insurance and the document import for a Spanish browser.
// The English wording is pinned by each component's own test.
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }));
const upload = vi.hoisted(() => vi.fn());
vi.mock("@/utils/useUpload", () => ({ default: () => [upload, { loading: false }] }));
const hooks = vi.hoisted(() =>
  Object.fromEntries(
    [
      "useAdoptableListings",
      "useCreateAdoptableListing",
      "useUpdateAdoptableListing",
      "useDeleteAdoptableListing",
      "useRelistAdoptableListing",
      "useAdoptionApplications",
      "useReviewAdoptionApplication",
      "useOpenAdoptionApplicantThread",
      "useDaycareStays",
      "useDaycareStayAction",
      "usePostReportCard",
      "useDaycareRequirements",
      "useAddDaycareRequirement",
      "usePetVaccineCheck",
      "useTrainingSessions",
      "useCreateTrainingSession",
      "useTrainingProgress",
      "useLogTrainingProgress",
      "useWalkPackages",
      "useCreateWalkPackage",
      "useUpdateWalkPackage",
      "useDeactivateWalkPackage",
      "useProviderRxFulfillment",
      "useRxFulfillmentAction",
      "useProviderInsurancePolicies",
      "useInsurancePolicyAction",
      "useEnrichProviderDocument",
      "useCreateService",
      "useCreateShopProduct",
    ].map((name) => [name, vi.fn()]),
  ),
);
vi.mock("../hooks/useProviders", () => hooks);

import { toast } from "sonner";
import { setVisitorLang } from "../../../lib/publicPet/langStore";
import ProviderAdoption from "./ProviderAdoption";
import ProviderDaycare from "./ProviderDaycare";
import ProviderTraining from "./ProviderTraining";
import ProviderWalkPackages from "./ProviderWalkPackages";
import PharmacyQueue from "./PharmacyQueue";
import InsurancePolicies from "./InsurancePolicies";
import DocumentCatalogImport from "./DocumentCatalogImport";

const query = (data, extra = {}) => ({ data, isLoading: false, isError: false, error: null, ...extra });
const mutation = (overrides = {}) => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn().mockResolvedValue({}),
  isPending: false,
  ...overrides,
});
// A mutation that answers each call through its onSuccess / onError.
const succeeds = () => mutation({ mutate: vi.fn((_, options) => options?.onSuccess?.({})) });
const refuses = (message, status) =>
  mutation({
    mutate: vi.fn((_, options) => options?.onError?.(Object.assign(new Error(message), { status }))),
    mutateAsync: vi.fn().mockRejectedValue(Object.assign(new Error(message), { status })),
  });

const button = (name) => screen.getByRole("button", { name });
const text = (value) => screen.getByText(value);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState(null, "", "/provider");
  vi.spyOn(window.navigator, "languages", "get").mockReturnValue(["es-AR", "es"]);
  for (const hook of Object.values(hooks)) hook.mockReturnValue(mutation());
  for (const name of [
    "useAdoptableListings",
    "useAdoptionApplications",
    "useDaycareStays",
    "useDaycareRequirements",
    "useTrainingSessions",
    "useTrainingProgress",
    "useWalkPackages",
  ]) {
    hooks[name].mockReturnValue(query([]));
  }
  hooks.usePetVaccineCheck.mockReturnValue({ data: undefined, isFetching: false, error: null, refetch: vi.fn() });
  hooks.useProviderRxFulfillment.mockReturnValue(query({ orders: [] }));
  hooks.useProviderInsurancePolicies.mockReturnValue(query({ policies: [] }));
});
afterEach(() => vi.restoreAllMocks());

describe("adoption in Spanish", () => {
  const dog = {
    id: 1,
    name: "Rex",
    breed: "Beagle",
    adoption_fee_cents: 125000,
    currency: "ARS",
    status: "available",
    photo_urls: ["https://cdn/a.jpg", "https://cdn/b.jpg"],
    video_url: "https://cdn/v.mp4",
  };
  const application = {
    id: 9,
    listing_id: 1,
    listing_name: "Rex",
    listing_status: "available",
    applicant_owner_user_id: 4,
    status: "submitted",
    answers: [{ question: "", answer: "11 5555 1234" }],
  };

  it("names the screen, the statuses, the money and the uploaders", () => {
    hooks.useAdoptableListings.mockReturnValue(query([dog, { id: 2, name: "Luna", adoption_fee_cents: 0, status: "adopted" }]));
    hooks.useAdoptionApplications.mockReturnValue(query([application]));
    render(<ProviderAdoption providerId={10} />);

    expect(screen.getByRole("heading", { name: "Adopción" })).toBeInTheDocument();
    expect(text("Perros en adopción")).toBeInTheDocument();
    expect(text("Beagle · ARS 1.250,00 · 2 fotos · video")).toBeInTheDocument();
    expect(button("Anteriores (1)")).toBeInTheDocument();
    expect(button("Adoptados")).toBeInTheDocument();
    expect(text("Fotos (la primera es la portada)")).toBeInTheDocument();
    expect(text("Video de presentación")).toBeInTheDocument();
    expect(text("Enviada")).toBeInTheDocument();
    expect(text("1 solicitud")).toBeInTheDocument();
    expect(text("Solicitante n.º 4 → Rex")).toBeInTheDocument();
    expect(text("Pregunta:")).toBeInTheDocument();
    expect(button("Aprobar")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Nombre del perro")).toBeInTheDocument();
    expect(screen.getByLabelText("Quitar la pregunta 1")).toBeInTheDocument();

    fireEvent.click(button("Editar"));
    expect(screen.getByRole("dialog", { name: "Editar a Rex" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Pendiente" })).toBeInTheDocument();
    expect(button("Guardar cambios")).toBeInTheDocument();
  });

  it("seeds a Spanish phone question that follows the language and that the mobile app reads as a phone", async () => {
    const create = mutation();
    hooks.useCreateAdoptableListing.mockReturnValue(create);
    render(<ProviderAdoption providerId={10} />);

    const question = screen.getByLabelText("Pregunta 1");
    expect(question).toHaveValue("Teléfono de contacto");
    // The pattern of anything/apps/mobile/src/app/business-adoption.jsx.
    expect(question.value).toMatch(/contact number|phone|tel[eé]fono|celular/i);
    act(() => setVisitorLang("en"));
    expect(screen.getByLabelText("Question 1")).toHaveValue("Best contact number");
    act(() => setVisitorLang("es"));

    fireEvent.change(screen.getByPlaceholderText("Nombre del perro"), { target: { value: "Rex" } });
    fireEvent.click(button("Publicar un perro"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Publicaste el perro"));
    expect(create.mutateAsync.mock.calls[0][0].application_questions).toEqual(["Teléfono de contacto"]);
  });

  it("explains a wrong age and refused requests in Spanish", async () => {
    hooks.useCreateAdoptableListing.mockReturnValue(
      refuses("Your text contains language that isn't allowed. Please edit it and try again."),
    );
    hooks.useAdoptionApplications.mockReturnValue(query([application]));
    hooks.useReviewAdoptionApplication.mockReturnValue(refuses("Failed to update application"));
    render(<ProviderAdoption providerId={10} />);

    fireEvent.change(screen.getByPlaceholderText("Nombre del perro"), { target: { value: "Rex" } });
    fireEvent.change(screen.getByLabelText("Meses extra"), { target: { value: "20" } });
    fireEvent.click(button("Publicar un perro"));
    expect(toast.error).toHaveBeenLastCalledWith("Los meses tienen que ser un número entero de 0 a 11.");

    fireEvent.change(screen.getByLabelText("Meses extra"), { target: { value: "2" } });
    fireEvent.click(button("Publicar un perro"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenLastCalledWith(
        "Tu texto tiene palabras que no están permitidas. Editalo y probá de nuevo.",
      ),
    );
    fireEvent.click(button("Rechazar"));
    await waitFor(() => expect(toast.error).toHaveBeenLastCalledWith("No pudimos actualizar la solicitud"));
  });
});

describe("daycare in Spanish", () => {
  const stay = {
    id: 1,
    pet_id: 55,
    status: "booked",
    start_date: "2026-08-01T00:00:00.000Z",
    end_date: "2026-08-03",
  };

  it("shows stays with es-AR dates and translated vaccine results", () => {
    hooks.useDaycareStays.mockReturnValue(query([stay]));
    hooks.usePetVaccineCheck.mockReturnValue({
      data: { passed: false, required: ["Rabia"], missing: ["Rabia"] },
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<ProviderDaycare providerId={3} />);

    expect(screen.getByRole("heading", { name: "Guardería y hospedaje" })).toBeInTheDocument();
    expect(text("Mascota n.º 55")).toBeInTheDocument();
    expect(text("Reservada")).toBeInTheDocument();
    expect(screen.getByText(/01\/08\/2026 → 03\/08\/2026/)).toBeInTheDocument();
    expect(text("Faltan: Rabia")).toBeInTheDocument();
    expect(button("Registrar ingreso")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Por ejemplo, antirrábica")).toBeInTheDocument();
    fireEvent.click(button("Reporte diario"));
    expect(screen.getByPlaceholderText("Ánimo")).toBeInTheDocument();
    expect(button("Publicar reporte")).toBeInTheDocument();
  });

  it("translates a refused check-in and the consent message", async () => {
    hooks.useDaycareStays.mockReturnValue(query([stay]));
    hooks.useDaycareStayAction.mockReturnValue(
      refuses("Cannot apply that action to this stay (wrong status or access denied)", 409),
    );
    hooks.usePetVaccineCheck.mockReturnValue({
      data: undefined,
      isFetching: false,
      error: Object.assign(new Error("No active care-access grant for the required scope"), { status: 403 }),
      refetch: vi.fn(),
    });
    render(<ProviderDaycare providerId={3} />);

    expect(text("Para ver las vacunas necesitás el permiso del dueño.")).toBeInTheDocument();
    fireEvent.click(button("Registrar ingreso"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "No se puede hacer eso con esta estadía: cambió de estado o no tenés acceso.",
      ),
    );
  });
});

describe("training in Spanish", () => {
  it("names kinds, seats and roster statuses", () => {
    hooks.useTrainingSessions.mockReturnValue(
      query([{ id: 1, kind: "group_class", capacity: 6, attendee_count: 2 }]),
    );
    hooks.useTrainingProgress.mockReturnValue(query([{ id: 3, pet_id: 8, status: "booked" }]));
    render(<ProviderTraining providerId={3} />);

    expect(screen.getByRole("heading", { name: "Entrenamiento" })).toBeInTheDocument();
    expect(screen.getByText(/Clase grupal · 2 \/ 6 lugares/)).toBeInTheDocument();
    fireEvent.click(button("Registrar avance"));
    expect(text("Mascota n.º 8")).toBeInTheDocument();
    expect(text("Reservado")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Nota de avance (la ve el dueño)")).toBeInTheDocument();
    expect(button("Marcar asistencia y guardar")).toBeInTheDocument();
  });
});

describe("walk packages in Spanish", () => {
  const pack = { id: 1, walks_count: 10, price_cents: 9000000, active: true };

  it("shows es-AR money and asks for confirmation in Spanish", () => {
    hooks.useWalkPackages.mockReturnValue(query([pack]));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    hooks.useDeactivateWalkPackage.mockReturnValue(succeeds());
    render(<ProviderWalkPackages providerId={1} />);

    expect(text("10 paseos")).toBeInTheDocument();
    expect(text(/90\.000,00/)).toBeInTheDocument();
    expect(text(/9\.000,00$/)).toBeInTheDocument();
    expect(text("+ Paseo único")).toBeInTheDocument();
    expect(text("+ Paquete de 20")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Por paseo" })).toBeInTheDocument();
    fireEvent.click(button("Desactivar"));
    expect(confirm.mock.calls[0][0]).toMatch(/^¿Desactivar el paquete de 10 paseos\?/);
    expect(toast.success).toHaveBeenCalledWith("Desactivaste el paquete");
  });

  it("shows form errors in Spanish, following the language", async () => {
    render(<ProviderWalkPackages providerId={1} />);
    fireEvent.click(button("Agregar paquete"));
    const submit = () => fireEvent.submit(screen.getByPlaceholderText("10").closest("form"));
    submit();
    expect(
      await screen.findByText("La cantidad de paseos tiene que ser un número entero mayor que cero"),
    ).toBeInTheDocument();
    act(() => setVisitorLang("en"));
    expect(text("Walks must be a positive whole number")).toBeInTheDocument();
    act(() => setVisitorLang("es"));

    fireEvent.change(screen.getByPlaceholderText("10"), { target: { value: "10" } });
    fireEvent.change(screen.getByPlaceholderText("90,00"), { target: { value: "abc" } });
    submit();
    expect(await screen.findByText("Ingresá un importe válido (por ejemplo, 12,50 o 1.250,00)")).toBeInTheDocument();
  });
});

describe("pharmacy in Spanish", () => {
  const order = {
    id: 1,
    status: "accepted",
    method: "pickup",
    is_refill: true,
    refills_remaining: 1,
    price_cents: 123450,
  };

  it("names the order and its next step, and translates a refusal", () => {
    hooks.useProviderRxFulfillment.mockReturnValue(query({ orders: [order] }));
    hooks.useRxFulfillmentAction.mockReturnValue(refuses("no_refills", 409));
    render(<PharmacyQueue providerId={1} />);

    expect(screen.getByRole("heading", { name: "Entrega de recetas" })).toBeInTheDocument();
    expect(text("Medicamento")).toBeInTheDocument();
    expect(text("Aceptado")).toBeInTheDocument();
    expect(screen.getByText(/Reposición · queda 1 reposición · \$\s1\.234,50/)).toBeInTheDocument();
    fireEvent.click(button("Marcar en preparación"));
    expect(toast.error).toHaveBeenCalledWith("A esta receta no le quedan reposiciones.");
  });

  it("says in Spanish what the business does not offer", () => {
    hooks.useProviderRxFulfillment.mockReturnValue(
      query(undefined, { isError: true, error: Object.assign(new Error("x"), { status: 403 }) }),
    );
    render(<PharmacyQueue providerId={1} />);
    expect(text("Este negocio no tiene activada la opción «Entrega de recetas».")).toBeInTheDocument();
  });
});

describe("insurance in Spanish", () => {
  it("names statuses, billing and payment state, and confirms an update", () => {
    hooks.useProviderInsurancePolicies.mockReturnValue(
      query({
        policies: [
          {
            id: 1,
            status: "payment_pending",
            premium_cents: 150000,
            billing_period: "monthly",
            payment_status: "pending",
          },
        ],
      }),
    );
    hooks.useInsurancePolicyAction.mockReturnValue(succeeds());
    render(<InsurancePolicies providerId={1} />);

    expect(screen.getByRole("heading", { name: "Pólizas" })).toBeInTheDocument();
    expect(text("Pendiente de pago")).toBeInTheDocument();
    expect(screen.getByText(/Mascota · \$\s1\.500,00\/mes/)).toBeInTheDocument();
    expect(text(/Falta aceptar los términos · pago pendiente/)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "anual" })).toHaveValue("annual");
    fireEvent.click(button("Emitir / actualizar"));
    expect(toast.success).toHaveBeenCalledWith("Actualizaste la póliza");
  });
});

describe("document import in Spanish", () => {
  async function choose() {
    fireEvent.click(screen.getByText("Importar desde una lista de precios o un menú"));
    fireEvent.change(screen.getByLabelText("Subir una lista de precios o un menú"), {
      target: { files: [new File(["x"], "menu.csv", { type: "text/csv" })] },
    });
  }

  it("proposes rows in Spanish and confirms what was added", async () => {
    upload.mockResolvedValue({ url: "https://store/menu.csv" });
    hooks.useEnrichProviderDocument.mockReturnValue(
      mutation({
        mutate: vi.fn((_, options) =>
          options.onSuccess({ draft: { services: [{ name: "Baño", price: "20" }], products: [] } }),
        ),
      }),
    );
    hooks.useCreateService.mockReturnValue(succeeds());
    render(<DocumentCatalogImport providerId={1} />);
    await choose();

    expect(await screen.findByText("servicio")).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre propuesto")).toHaveValue("Baño");
    expect(screen.getByPlaceholderText("Precio (por ejemplo, 25)")).toBeInTheDocument();
    fireEvent.click(button("Aplicar"));
    expect(toast.success).toHaveBeenCalledWith("Agregaste el servicio «Baño»");
  });

  it("translates a failed upload", async () => {
    upload.mockResolvedValue({ error: "Upload failed: File too large." });
    render(<DocumentCatalogImport providerId={1} />);
    await choose();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("No pudimos subir el archivo: es demasiado grande."),
    );
  });
});

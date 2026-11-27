import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

// The panel's frame, home and shared parts for a Spanish (or not English) browser. The English wording is pinned by
// each component's own test.
vi.mock("@/utils/useUser", () => ({ default: () => ({ user: { id: "u1" }, loading: false }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const upload = vi.hoisted(() => vi.fn());
vi.mock("@/utils/useUpload", () => ({ default: () => [upload, { loading: false }] }));
vi.mock("../../../client-integrations/recharts", () => {
  const Box = ({ children }) => <div>{children}</div>;
  const Nothing = () => null;
  return {
    ResponsiveContainer: Box,
    BarChart: Box,
    LineChart: Box,
    Bar: Nothing,
    Line: Nothing,
    XAxis: Nothing,
    YAxis: Nothing,
    Tooltip: Nothing,
    CartesianGrid: Nothing,
  };
});

import { toast } from "sonner";
import ProviderShell from "./ProviderShell";
import ProviderDashboard from "./ProviderDashboard";
import ProviderInvitesPage from "../invites/page";
import ImageUploader from "./ImageUploader";
import VideoUploader from "./VideoUploader";
import AdvancedSection from "./AdvancedSection";
import { getProviderQueryClient } from "../lib/queryClient";

const VET = { id: 1, name: "Happy Paws", provider_type: "vet", capabilities: ["vet"] };

// Answers the panel's reads by URL; anything not listed is an empty object.
function serve(routes) {
  global.fetch = vi.fn((url, init) => {
    const hit = Object.entries(routes).find(([part]) => String(url).includes(part));
    const answer = typeof hit?.[1] === "function" ? hit[1](init) : hit?.[1];
    const { status = 200, body = answer ?? {} } = answer?.status ? answer : {};
    return Promise.resolve({ ok: status < 400, status, json: async () => body });
  });
}

const inRouter = (node) => render(<MemoryRouter>{node}</MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  getProviderQueryClient().clear();
  window.history.replaceState(null, "", "/provider");
  vi.spyOn(window.navigator, "languages", "get").mockReturnValue(["es-AR", "es"]);
});
afterEach(() => vi.restoreAllMocks());

describe("panel shell in Spanish", () => {
  it("names the navigation in Spanish and switches to English from the panel", async () => {
    serve({ "moderation-summary": { is_admin: true, open_count: 1 }, "/api/providers": { providers: [VET] } });
    inRouter(<ProviderShell active="dashboard">{() => <div />}</ProviderShell>);

    expect(await screen.findByText("Happy Paws")).toBeInTheDocument();
    expect(screen.getByText("PawPi Negocios")).toBeInTheDocument();
    expect(screen.getByText("Veterinaria")).toBeInTheDocument();
    for (const name of ["Panel", "Mensajes", "Reservas", "Historias clínicas", "Equipo", "Ventas"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
    for (const header of ["Agenda", "Tienda", "Cuidado", "Negocio"]) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }
    expect(await screen.findByLabelText("1 denuncia abierta")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Idioma" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("es-AR");

    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByRole("link", { name: "Bookings" })).toBeInTheDocument();
    expect(screen.getByText("PawPi Provider")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem("pawpi.lang")).toBe("en");
  });

  it("is Spanish for a browser in a third language", async () => {
    vi.spyOn(window.navigator, "languages", "get").mockReturnValue(["pt-BR"]);
    serve({ "/api/providers": { providers: [VET] } });
    inRouter(<ProviderShell active="dashboard">{() => <div />}</ProviderShell>);
    expect(await screen.findByRole("link", { name: "Reservas" })).toBeInTheDocument();
  });

  it("offers an account with no business the Spanish onboarding, invitations and admin entry", async () => {
    serve({
      "moderation-summary": { is_admin: true, open_count: 2 },
      "provider-invites": { invites: [{ id: 5, provider_id: 100 }, { id: 6, provider_id: 101 }] },
      "/api/providers": { providers: [] },
    });
    inRouter(<ProviderShell active="dashboard">{() => <div />}</ProviderShell>);

    expect(await screen.findByRole("heading", { name: "Creá tu negocio" })).toBeInTheDocument();
    expect(await screen.findByText("Tenés 2 invitaciones pendientes")).toBeInTheDocument();
    expect(await screen.findByText("Tenés acceso de administración: 2 denuncias abiertas")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Clínica veterinaria" })).toBeInTheDocument();
    expect(screen.getByText("Veterinaria y salud")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Paseo de perros" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Opciones avanzadas" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Idioma" })).toBeInTheDocument();
  });

  it("shows form errors in Spanish, following the switch", async () => {
    serve({ "/api/providers": { providers: [] } });
    inRouter(<ProviderShell active="dashboard">{() => <div />}</ProviderShell>);
    fireEvent.click(await screen.findByRole("button", { name: "Crear negocio" }));
    expect(await screen.findByText("Ingresá el nombre del negocio")).toBeInTheDocument();
    expect(screen.getByText("Elegí un tipo de negocio")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByText("Business name is required")).toBeInTheDocument();
    expect(screen.getByText("Choose a provider type")).toBeInTheDocument();
  });

  it("translates a refused request when creating the business", async () => {
    serve({
      "/api/providers": (init) =>
        init?.method === "POST"
          ? { status: 500, body: { error: "Failed to create provider" } }
          : { providers: [] },
    });
    inRouter(<ProviderShell active="dashboard">{() => <div />}</ProviderShell>);
    fireEvent.change(await screen.findByPlaceholderText("Veterinaria Patitas Felices"), {
      target: { value: "Vet" },
    });
    fireEvent.change(screen.getByLabelText("Tipo de negocio"), { target: { value: "vet" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear negocio" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("No pudimos crear tu negocio"));
  });

  it("explains a failed load in Spanish", async () => {
    getProviderQueryClient().setDefaultOptions({ queries: { retry: false } });
    serve({ "/api/providers": { status: 401, body: { error: "Unauthorized" } } });
    inRouter(<ProviderShell active="dashboard">{() => <div />}</ProviderShell>);
    expect(await screen.findByText("No pudimos cargar tus negocios", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText("Tu sesión venció. Iniciá sesión de nuevo.")).toBeInTheDocument();
  });
});

describe("dashboard in Spanish", () => {
  const analytics = {
    revenue: { currency: "ARS", total_cents: 125000, paid_order_count: 1, by_month: [] },
    bookings: {
      total: 30,
      upcoming_count: 4,
      by_month: [],
      upcoming: [
        {
          id: 1,
          pet_name: null,
          capability: "groomer",
          appointment_date: "2026-07-01",
          appointment_time: "09:00:00",
          booking_status: "requested",
        },
      ],
    },
    occupancy: { on_site: 2, booked_ahead: 7 },
    rating: { avg_rating: 4.5, review_count: 2 },
    top_services: [],
  };

  it("shows words, money and dates the es-AR way, with the getting-started card", async () => {
    serve({
      "/analytics": analytics,
      "/api/providers/1/services": { services: [] },
      "/api/providers/1": { provider: { id: 1 }, capabilities: [] },
    });
    const { QueryClientProvider } = await import("@tanstack/react-query");
    inRouter(
      <QueryClientProvider client={getProviderQueryClient()}>
        <ProviderDashboard providerId={1} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("ARS 1.250,00")).toBeInTheDocument();
    for (const text of [
      "Ingresos (cobrados)",
      "1 orden pagada",
      "4 próximas",
      "7 reservadas por adelantado",
      "4,50",
      "2 reseñas",
      "Ingresos por mes (ARS)",
      "Todavía no hay órdenes pagadas.",
      "Todavía no hay reservas de servicios.",
      "Próximas reservas",
      "Mascota",
      "Solicitada",
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByText(/Peluquería\s+· 01\/07\/2026 · 09:00/)).toBeInTheDocument();
    expect(await screen.findByText("Primeros pasos")).toBeInTheDocument();
    expect(screen.getByText("0 de 5 listos: terminá de armar tu vidriera.")).toBeInTheDocument();
    expect(screen.getByText("Completá el perfil de tu negocio")).toBeInTheDocument();
  });
});

describe("invitations page in Spanish", () => {
  const invite = { id: 5, provider_id: 100, role: "vet", provider_name: "Happy Paws", provider_type: "vet" };

  it("lists, declines and offers the language switch", async () => {
    serve({
      "provider-invites": { invites: [invite] },
      "/staff/accept": { status: 404, body: { error: "No pending invite for this provider" } },
    });
    inRouter(<ProviderInvitesPage />);

    expect(await screen.findByText("Invitaciones pendientes")).toBeInTheDocument();
    expect(await screen.findByText("te invitaron como")).toBeInTheDocument();
    expect(screen.getByText("Profesional veterinario")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Idioma" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Ya no tenés una invitación pendiente de este negocio."),
    );
  });
});

describe("shared parts in Spanish", () => {
  it("labels the uploaders and translates an upload failure", async () => {
    upload.mockResolvedValue({ error: "Upload failed: File too large." });
    render(
      <>
        <ImageUploader value={["https://example.test/a.jpg"]} onChange={() => {}} />
        <VideoUploader value="" onChange={() => {}} />
        <AdvancedSection>x</AdvancedSection>
      </>,
    );
    for (const name of ["Agregar imagen", "Quitar la imagen 1", "Agregar video", "Opciones avanzadas"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByText("Imágenes")).toBeInTheDocument();
    expect(screen.getByText("Video de presentación")).toBeInTheDocument();
    const [images] = document.querySelectorAll('input[type="file"]');
    fireEvent.change(images, { target: { files: [new File(["x"], "b.jpg", { type: "image/jpeg" })] } });
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("No pudimos subir el archivo: es demasiado grande."),
    );
  });
});

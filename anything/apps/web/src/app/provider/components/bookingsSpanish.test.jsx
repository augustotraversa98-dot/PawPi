import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";

// Bookings, calendar, open hours, calendar import, chats, staff, sales and payments for a Spanish (or not
// English) browser. The English wording is pinned by each screen's own test.
const hooks = vi.hoisted(() => ({}));
vi.mock("../hooks/useProviders", () =>
  Object.fromEntries(
    [
      "useProvider",
      "useProviderBookings",
      "useProviderBookingsCalendar",
      "useBookingAction",
      "useEndTelehealthConsult",
      "useProviderStaff",
      "useInviteStaff",
      "useUpdateStaffRole",
      "useRemoveStaff",
      "useUpdateProviderProfile",
      "useAvailabilityWindows",
      "useCreateAvailabilityWindow",
      "useUpdateAvailabilityWindow",
      "useDeleteAvailabilityWindow",
      "useProviderCalendarFeeds",
      "useAddCalendarFeed",
      "useSyncCalendarFeed",
      "useRemoveCalendarFeed",
      "useProviderThreads",
      "useThreadMessages",
      "useSendMessage",
      "useMarkThreadRead",
      "useProviderSales",
      "usePaymentAccounts",
      "useDisconnectMercadoPago",
    ].map((name) => [name, (...args) => hooks[name](...args)]),
  ),
);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const chart = vi.hoisted(() => ({}));
vi.mock("../../../client-integrations/recharts", () => {
  const Box = ({ children }) => <div>{children}</div>;
  const keep = (name) => (props) => {
    chart[name] = props;
    return null;
  };
  return {
    ResponsiveContainer: Box,
    LineChart: Box,
    CartesianGrid: () => null,
    Line: keep("line"),
    XAxis: keep("x"),
    YAxis: keep("y"),
    Tooltip: keep("tooltip"),
  };
});

import { toast } from "sonner";
import { setVisitorLang } from "../../../lib/publicPet/langStore";
import { formatBookingWhen } from "../lib/bookingTime";
import { dayHeader, hourLabel } from "../lib/calendar";
import BookingsInbox from "./BookingsInbox";
import ProviderCalendar from "./ProviderCalendar";
import ProviderAvailability from "./ProviderAvailability";
import ProviderCalendarFeeds from "./ProviderCalendarFeeds";
import ProviderChats from "./ProviderChats";
import ProviderStaff from "./ProviderStaff";
import ProviderSales from "./ProviderSales";
import PaymentAccountCard from "./PaymentAccountCard";
import MercadoPagoReturnPage from "../payments/mercadopago/return/page";

const ZONE = "America/Argentina/Buenos_Aires";
const query = (data) => () => ({ data, isLoading: false, isError: false });
const failed = (message) => () => ({ isLoading: false, isError: true, error: new Error(message) });
// A mutation that ends at once, successfully or with the server's message.
const mutation = (outcome = {}) => {
  const mutate = vi.fn((_variables, options) =>
    outcome.error
      ? options?.onError?.(new Error(outcome.error))
      : options?.onSuccess?.(outcome.data),
  );
  const mutateAsync = vi.fn(async () => {
    if (outcome.error) throw new Error(outcome.error);
    return outcome.data;
  });
  return { mutate, mutateAsync, isPending: false };
};

const inRouter = (node) => render(<MemoryRouter>{node}</MemoryRouter>);
const say = (text) => expect(screen.getByText(text)).toBeInTheDocument();

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState(null, "", "/provider");
  vi.spyOn(window.navigator, "languages", "get").mockReturnValue(["es-AR", "es"]);
  hooks.useProvider = query({ provider: { id: 1, time_zone: ZONE } });
  hooks.useProviderStaff = query([]);
  hooks.useEndTelehealthConsult = () => mutation();
  hooks.useBookingAction = () => mutation();
});
afterEach(() => vi.restoreAllMocks());

const BOOKING = {
  id: 7,
  pet_id: 55,
  start_at: "2026-06-16T15:00:00.000Z",
  end_at: "2026-06-16T15:30:00.000Z",
  pet_name: null,
  owner_name: "Sam",
  capability: "groomer",
  pet_species: "dog",
  booking_status: "requested",
  staff_user_id: 9,
  value_cents: 125000,
  value_currency: "ARS",
  paid: false,
};

describe("booking dates and grid labels", () => {
  it("writes them the es-AR way and keeps English as it was", () => {
    expect(formatBookingWhen(BOOKING, ZONE, "es")).toBe("16/06/2026 · 12:00");
    expect(formatBookingWhen(BOOKING, ZONE)).toBe("16 Jun 2026 · 12:00");
    const wall = { appointment_date: "2026-08-15", appointment_time: "09:00:00" };
    expect(formatBookingWhen(wall, undefined, "es")).toBe("15/08/2026 · 09:00");
    expect(formatBookingWhen(wall, "Not/AZone", "es")).toBe("15/08/2026 · 09:00");
    expect(formatBookingWhen({ ...wall, start_at: BOOKING.start_at }, "Not/AZone", "es")).toBe(
      "15/08/2026 · 09:00",
    );
    expect(formatBookingWhen({}, ZONE, "es")).toBe("—");
    expect([hourLabel(0, "es"), hourLabel(13, "es"), hourLabel(13)]).toEqual(["00:00", "13:00", "1 PM"]);
    const wednesday = new Date(2026, 5, 17);
    expect([dayHeader(wednesday, "es"), dayHeader(wednesday)]).toEqual(["Mié 17", "Wed 17"]);
  });
});

describe("bookings inbox in Spanish", () => {
  it("names columns, filters, statuses and actions, and follows the switch", () => {
    hooks.useProviderBookings = query([BOOKING]);
    inRouter(<BookingsInbox providerId={1} />);

    say("Reservas");
    for (const name of ["Reserva n.º", "Fecha y hora", "Mascota", "Dueño", "A cargo", "Acciones"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("option", { name: "Solicitadas" })).toHaveValue("requested");
    expect(screen.getByRole("option", { name: "Fecha de creación" })).toHaveValue("created");
    expect(screen.getByRole("searchbox", { name: "Buscar reservas" })).toBeInTheDocument();
    say("16/06/2026 · 12:00");
    say("Solicitada");
    say("Integrante #9");

    act(() => setVisitorLang("en"));
    expect(screen.getByRole("columnheader", { name: "Date & time" })).toBeInTheDocument();
    say("16 Jun 2026 · 12:00");
    say("requested");
    say("Staff #9");
  });

  it("asks and answers in Spanish, translating a refusal", () => {
    const action = mutation({ error: "Only a requested booking can be declined" });
    hooks.useBookingAction = () => action;
    hooks.useProviderBookings = query([BOOKING]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    inRouter(<BookingsInbox providerId={1} />);

    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    expect(confirm).toHaveBeenCalledWith("¿Querés rechazar la reserva de esta mascota?");
    expect(action.mutate.mock.calls[0][0]).toMatchObject({ appointmentId: 7, action: "decline" });
    expect(toast.error).toHaveBeenCalledWith("Solo se puede rechazar una reserva solicitada.");

    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));
    expect(screen.getByRole("dialog", { name: "Asignar a alguien del equipo" })).toBeInTheDocument();
    say("Asignar reserva");
  });

  it("replaces a generic failure with its own Spanish text", () => {
    hooks.useProviderBookings = failed("Failed to fetch bookings");
    inRouter(<BookingsInbox providerId={1} />);
    say("No pudimos cargar las reservas");
    say("Probá de nuevo.");
  });
});

describe("calendar in Spanish", () => {
  it("shows the grid and the booking detail", () => {
    const action = mutation();
    hooks.useBookingAction = () => action;
    hooks.useProviderBookingsCalendar = query([BOOKING]);
    inRouter(<ProviderCalendar providerId={1} initialAnchor={new Date(2026, 5, 16)} />);

    say("Calendario");
    expect(screen.getByRole("button", { name: "Semana" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeInTheDocument();
    say("Lun 15");
    say("07:00");
    expect(screen.getByText(/15 jun.* – .*21 jun/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("calendar-booking"));
    const dialog = within(screen.getByRole("dialog", { name: "Detalle de la reserva" }));
    for (const text of [
      "16/06/2026 · 12:00",
      "Peluquería",
      "Perro",
      "Visita a domicilio",
      "Solicitada",
      "ARS 1.250,00 · Sin pagar",
    ]) {
      expect(dialog.getByText(text)).toBeInTheDocument();
    }
    fireEvent.click(dialog.getByRole("button", { name: "Confirmar" }));
    expect(toast.success).toHaveBeenCalledWith("Reserva confirmada");
  });

  it("says an empty day is empty", () => {
    hooks.useProviderBookingsCalendar = query([]);
    inRouter(<ProviderCalendar providerId={1} initialAnchor={new Date(2026, 5, 16)} />);
    say("No hay reservas esta semana");
    fireEvent.click(screen.getByRole("button", { name: "Día" }));
    say("No hay reservas este día");
  });
});

describe("open hours in Spanish", () => {
  beforeEach(() => {
    hooks.useAvailabilityWindows = query({
      windows: [{ id: 3, weekday: 2, start_time: "09:00:00", end_time: "13:00:00", active: true }],
      scoped_count: 2,
    });
    hooks.useUpdateProviderProfile = () => mutation();
    hooks.useCreateAvailabilityWindow = () => mutation();
    hooks.useUpdateAvailabilityWindow = () => mutation();
    hooks.useDeleteAvailabilityWindow = () => mutation({ error: "Availability window not found" });
  });

  it("names the days, confirms in Spanish and translates a refusal", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ProviderAvailability providerId={1} />);

    say("Zona horaria");
    say("Mié");
    expect(screen.getByText(/también tiene 2 franjas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(confirm).toHaveBeenCalledWith("¿Querés eliminar este horario (09:00–13:00)? No se puede deshacer.");
    expect(toast.error).toHaveBeenCalledWith("No encontramos ese horario.");
  });

  it("shows the form rule in the current language", async () => {
    render(<ProviderAvailability providerId={1} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Agregar horario" })[0]);
    fireEvent.change(screen.getByLabelText("Hora de fin"), { target: { value: "08:00" } });
    fireEvent.submit(screen.getByLabelText("Hora de fin").closest("form"));
    expect(
      await screen.findByText("La hora de fin tiene que ser posterior a la de inicio"),
    ).toBeInTheDocument();
    act(() => setVisitorLang("en"));
    say("End time must be after start time");
  });
});

describe("calendar import in Spanish", () => {
  it("dates the last sync, counts synced blocks and checks the address", () => {
    hooks.useProviderCalendarFeeds = query([
      { id: 4, ics_url: "https://example.test/a.ics", last_synced_at: new Date(2026, 5, 16, 14, 30).toISOString() },
    ]);
    hooks.useAddCalendarFeed = () => mutation();
    hooks.useSyncCalendarFeed = () => mutation({ data: { ok: true, synced: 1 } });
    hooks.useRemoveCalendarFeed = () => mutation({ error: "Feed not found" });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ProviderCalendarFeeds providerId={1} />);

    say("Última sincronización: 16/06/2026 · 14:30");
    fireEvent.click(screen.getByRole("button", { name: "Actualizar ahora" }));
    expect(toast.success).toHaveBeenCalledWith("Sincronizamos 1 horario ocupado");
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    expect(toast.error).toHaveBeenCalledWith("No encontramos ese calendario.");
    fireEvent.submit(screen.getByLabelText("Dirección del calendario iCal").closest("form"));
    expect(toast.error).toHaveBeenCalledWith(
      "Ingresá una dirección de calendario iCal que empiece con http o https",
    );
  });
});

describe("chats in Spanish", () => {
  it("fills the fallbacks, dates messages and translates a refused message", () => {
    hooks.useProviderThreads = query([
      { id: 2, owner_user_id: 5, booking_id: 7, last_message_at: new Date(2026, 0, 3, 9, 5).toISOString() },
    ]);
    hooks.useThreadMessages = query([]);
    hooks.useMarkThreadRead = () => mutation();
    hooks.useSendMessage = () =>
      mutation({ error: "Your text contains language that isn't allowed. Please edit it and try again." });
    inRouter(<ProviderChats providerId={1} />);

    say("Mensajes de los dueños de mascotas");
    say("Dueño de mascota");
    say("03/01/2026");
    say("Elegí una conversación para empezar a chatear");
    fireEvent.click(screen.getByRole("button", { name: /Dueño de mascota/ }));
    say("Sobre la reserva #7");
    fireEvent.change(screen.getByLabelText("Mensaje"), { target: { value: "Hola" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(toast.error).toHaveBeenCalledWith(
      "Tu texto tiene palabras que no están permitidas. Editalo y probá de nuevo.",
    );
  });
});

describe("staff in Spanish", () => {
  it("shows roles and statuses in Spanish and sends the stored values", async () => {
    const invite = mutation({ error: "Invitee not found" });
    hooks.useProviderStaff = query([
      { id: 1, user_profile_id: 7, role: "owner", status: "active", full_name: "Ana" },
      { id: 2, user_profile_id: 8, role: "vet", status: "invited" },
    ]);
    hooks.useInviteStaff = () => invite;
    hooks.useUpdateStaffRole = () => mutation();
    hooks.useRemoveStaff = () => mutation();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ProviderStaff providerId={1} />);

    say("Titular (no se puede modificar)");
    say("Activo");
    say("Invitado");
    say("Usuario #8");
    expect(screen.getByLabelText("Cambiar el rol de Usuario #8", { selector: "select" })).toHaveValue("vet");
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    expect(confirm.mock.calls[0][0]).toMatch(/^¿Querés quitar a Usuario #8 de tu equipo\?/);

    fireEvent.click(screen.getByRole("button", { name: "Invitar" }));
    expect(await screen.findByText("Ingresá el nombre de usuario")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("@usuario"), { target: { value: "@juan" } });
    fireEvent.click(screen.getByRole("button", { name: "Invitar" }));
    await waitFor(() => expect(invite.mutate).toHaveBeenCalled());
    expect(invite.mutate.mock.calls[0][0]).toEqual({ username: "juan", role: "staff" });
    expect(toast.error).toHaveBeenCalledWith("No encontramos a nadie con ese nombre de usuario.");
  });
});

describe("sales and payments in Spanish", () => {
  beforeEach(() => {
    hooks.usePaymentAccounts = query({ accounts: {} });
    hooks.useDisconnectMercadoPago = () => mutation();
  });

  it("formats money, dates and stored values", () => {
    hooks.useProviderSales = query({
      currency: "ARS",
      revenue: { net_cents: 125000, approved_count: 1, by_month: [{ month: "2026-06", net_cents: 125000 }] },
      payouts: {
        rows: [{ id: 1, amount_cents: 50000, status: "paid", rail: "mercadopago", created_at: "2026-06-20T10:00:00Z" }],
      },
      reconciliation: {},
      ledger: [
        {
          id: 9,
          type: "walk_package",
          status: "approved",
          gross_cents: 150000,
          commission_cents: 25000,
          net_cents: 125000,
          created_at: "2026-06-16T10:00:00Z",
        },
      ],
    });
    render(<ProviderSales providerId={1} />);

    for (const text of [
      "Ingresos netos",
      "1 transacción pagada",
      "ARS 1.500,00",
      "ARS 250,00",
      "Liquidaciones",
      "20/06/2026 · MercadoPago",
      "Pagada",
      "16/06/2026",
      "Paquete de paseos",
      "Aprobado",
      "Cuenta de cobro",
    ]) {
      expect(screen.getByText((_, node) => node.textContent === text && node.children.length === 0)).toBeInTheDocument();
    }
    expect(chart.line.name).toBe("Importe");
    expect(chart.x.tickFormatter("2026-06")).toBe("06/2026");
    expect(chart.y.tickFormatter(1250)).toBe("1.250");
    expect(chart.tooltip.formatter(1250)).toBe("1.250");
  });

  it("translates a failure to load", () => {
    hooks.useProviderSales = failed("Failed to load sales");
    render(<ProviderSales providerId={1} />);
    say("No pudimos cargar tus ventas.");
  });

  it("keeps a connection error in the current language", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    render(<PaymentAccountCard providerId={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Conectar MercadoPago" }));
    expect(
      await screen.findByText("Los pagos todavía no están configurados en PawPi. Probá más tarde."),
    ).toBeInTheDocument();
    act(() => setVisitorLang("en"));
    say("Payments aren't set up on PawPi yet. Please try again later.");
  });

  it("asks before disconnecting, in Spanish", async () => {
    hooks.usePaymentAccounts = query({ accounts: { mercadopago: { connected: true, account_ref: "123" } } });
    const disconnect = mutation({ error: "Failed to disconnect" });
    hooks.useDisconnectMercadoPago = () => disconnect;
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PaymentAccountCard providerId={1} />);

    say("(cuenta 123)");
    fireEvent.click(screen.getByRole("button", { name: "Desconectar MercadoPago" }));
    expect(confirm.mock.calls[0][0]).toMatch(/^¿Querés desconectar MercadoPago\?/);
    expect(await screen.findByText("No pudimos desconectar la cuenta. Probá de nuevo.")).toBeInTheDocument();
  });

  it("translates the return page without connecting twice on a switch", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: "Invalid state" }) }));
    render(
      <MemoryRouter initialEntries={["/provider/payments/mercadopago/return?code=c&state=5.n"]}>
        <MercadoPagoReturnPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("No pudimos conectar MercadoPago")).toBeInTheDocument();
    say("El enlace de conexión ya no es válido. Volvé a iniciar la conexión desde tu panel.");
    expect(screen.getByRole("link", { name: "Volver a Ventas" })).toHaveAttribute("href", "/provider/sales");
    act(() => setVisitorLang("en"));
    say("Couldn't connect MercadoPago");
    say("Invalid state");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

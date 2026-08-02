import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// MercadoPago OAuth return page: recovers the provider id from `state`, POSTs code+state to
// the per-provider callback, and shows connecting / success / error. Never handles tokens.

const h = vi.hoisted(() => ({ search: "" }));
vi.mock("react-router", () => ({
  useSearchParams: () => [new URLSearchParams(h.search)],
}));

import MercadoPagoReturnPage from "./page";

function mockFetch(ok, body = {}) {
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok,
      status: ok ? 201 : 400,
      json: () => Promise.resolve(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.search = "";
});

describe("MercadoPago return page", () => {
  it("posts code+state to the provider's callback and shows success", async () => {
    h.search = "code=AUTHCODE&state=5.nonce123";
    mockFetch(true, { connected: true, rail: "mercadopago" });

    render(<MercadoPagoReturnPage />);

    expect(await screen.findByText("MercadoPago connected")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe(
      "/api/providers/5/payment-accounts/mercadopago/callback",
    );
    expect(opts.method).toBe("POST");
    const sent = JSON.parse(opts.body);
    expect(sent).toEqual({ code: "AUTHCODE", state: "5.nonce123" });
  });

  it("shows the server error and does not claim success on a failed exchange", async () => {
    h.search = "code=AUTHCODE&state=5.nonce123";
    mockFetch(false, { error: "Invalid state" });

    render(<MercadoPagoReturnPage />);

    expect(
      await screen.findByText("Couldn't connect MercadoPago"),
    ).toBeInTheDocument();
    expect(screen.getByText("Invalid state")).toBeInTheDocument();
  });

  it("with no code (user declined / bad link) shows an error and never calls the API", async () => {
    h.search = "state=5.nonce123";
    mockFetch(true);

    render(<MercadoPagoReturnPage />);

    expect(
      await screen.findByText("Couldn't connect MercadoPago"),
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("with no state (no provider id) shows an error and never calls the API", async () => {
    h.search = "code=AUTHCODE";
    mockFetch(true);

    render(<MercadoPagoReturnPage />);

    expect(
      await screen.findByText("Couldn't connect MercadoPago"),
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

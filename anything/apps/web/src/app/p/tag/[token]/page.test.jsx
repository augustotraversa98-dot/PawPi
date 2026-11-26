import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// Public tag page (ticket 2.51): renders WITHOUT auth from the whitelisted payload, shows medical
// ONLY when present, surfaces a LOST banner, relays a message with the finder's contact in relay mode,
// and shows the owner's phone / email only in those modes.

vi.mock("react-router", () => ({ useParams: () => ({ token: "TAG1" }) }));

import PublicTagPage from "./page";

function mockFetch(card, ok = true) {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok, status: ok ? 200 : 404, json: () => Promise.resolve({ card }) }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("public tag page", () => {
  it("renders basic info and NO medical section when medical is absent", async () => {
    mockFetch({
      pet: { name: "Rex", breed: "Beagle", species: "dog" },
      microchip_id: "chip-1",
      contact: { mode: "relay", value: null },
      lost: null,
      medical: null,
    });
    render(<PublicTagPage />);
    expect(await screen.findByText("Rex")).toBeInTheDocument();
    expect(screen.getByText("This dog has a home 💛")).toBeInTheDocument();
    expect(screen.queryByTestId("medical-section")).toBeNull();
  });

  it("shows the medical section when the owner enabled it", async () => {
    mockFetch({
      pet: { name: "Rex" },
      microchip_id: "chip-1",
      contact: { mode: "relay", value: null },
      lost: null,
      medical: { blood_type: "DEA 1.1+", allergies: [{ allergen: "Penicillin" }], conditions: [] },
    });
    render(<PublicTagPage />);
    expect(await screen.findByTestId("medical-section")).toBeInTheDocument();
    expect(screen.getByText("DEA 1.1+")).toBeInTheDocument();
    expect(screen.getByText("Penicillin")).toBeInTheDocument();
  });

  it("shows a LOST banner when an active lost report exists", async () => {
    mockFetch({
      pet: { name: "Rex" },
      contact: { mode: "none" },
      lost: { active: true, reward: "$100", last_seen_area: "Park" },
      medical: null,
    });
    render(<PublicTagPage />);
    expect(await screen.findByTestId("lost-banner")).toHaveTextContent(/LOST/);
  });

  const RELAY = { pet: { name: "Rex" }, contact: { mode: "relay", value: null }, lost: null, medical: null };
  const type = (testId, value) => fireEvent.change(screen.getByTestId(testId), { target: { value } });
  async function openRelay(reply) {
    global.fetch = vi.fn((url, init) =>
      init?.method === "POST"
        ? reply()
        : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ card: RELAY }) }),
    );
    render(<PublicTagPage />);
    await screen.findByText("Rex");
  }
  const answer = (body, status = 200) => () =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
  const posts = () => global.fetch.mock.calls.filter(([, init]) => init?.method === "POST");

  it("relay mode posts the message and the finder contact to the contact endpoint", async () => {
    await openRelay(answer({ ok: true }));
    type("relay-message", "found him!");
    type("finder-name", "Marta");
    type("finder-phone", "+54 11 1234 5678");
    fireEvent.click(screen.getByTestId("relay-send"));
    expect(await screen.findByTestId("relay-sent")).toBeInTheDocument();
    expect(posts()).toHaveLength(1);
    expect(posts()[0][0]).toBe("/api/public/emergency/tag/TAG1/contact");
    expect(JSON.parse(posts()[0][1].body)).toEqual({
      message: "found him!",
      finderName: "Marta",
      finderPhone: "+54 11 1234 5678",
      finderEmail: "",
    });
  });

  it.each([
    [{}, "So they can reach you, leave a phone number or an email."],
    [{ "finder-phone": "call me" }, "Check the phone number: use only digits, spaces and + ( ) -."],
    [{ "finder-email": "marta@" }, "Check the email address: it looks incomplete."],
  ])("does not send without a usable contact (%o)", async (fields, error) => {
    await openRelay(answer({ ok: true }));
    type("relay-message", "found him!");
    for (const [id, value] of Object.entries(fields)) type(id, value);
    fireEvent.click(screen.getByTestId("relay-send"));
    expect(await screen.findByRole("alert")).toHaveTextContent(error);
    expect(posts()).toHaveLength(0);
    expect(screen.queryByTestId("relay-sent")).toBeNull();
  });

  it.each([
    ["the server says it was not delivered", answer({ ok: false }), "We couldn’t send your message."],
    ["the server fails", answer({ error: "Internal server error" }, 500), "We couldn’t send your message."],
    ["the network fails", () => Promise.reject(new Error("offline")), "We couldn’t send your message."],
    ["the limit is hit", answer({ code: "rate_limited" }, 429), "Too many messages were sent"],
    ["the server rejects the contact", answer({ ok: false, error: "invalid_email" }, 400), "Check the email address"],
  ])("never shows success when %s, and keeps what was typed", async (_name, reply, text) => {
    await openRelay(reply);
    type("relay-message", "found him!");
    type("finder-email", "marta@example.test");
    fireEvent.click(screen.getByTestId("relay-send"));
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(screen.queryByTestId("relay-sent")).toBeNull();
    expect(screen.getByTestId("relay-message")).toHaveValue("found him!");
    expect(screen.getByTestId("finder-email")).toHaveValue("marta@example.test");
    await waitFor(() => expect(screen.getByTestId("relay-send")).toBeEnabled()); // can retry
  });

  it("sends once while a send is still in progress", async () => {
    await openRelay(() => new Promise(() => {}));
    type("finder-phone", "123456");
    fireEvent.click(screen.getByTestId("relay-send"));
    fireEvent.submit(screen.getByTestId("relay-send").closest("form"));
    expect(posts()).toHaveLength(1);
    expect(screen.getByTestId("relay-send")).toBeDisabled();
  });

  it.each([
    ["phone", "+54 9 11 5555-0101", "tel:+5491155550101", "Call the owner"],
    ["email", "ana@example.test", "mailto:ana@example.test", "Email the owner"],
  ])("%s mode shows the value, labelled and tappable, and no message form", async (mode, value, href, button) => {
    mockFetch({ ...RELAY, contact: { mode, value } });
    render(<PublicTagPage />);
    expect(await screen.findByRole("link", { name: value })).toHaveAttribute("href", href);
    expect(screen.getByRole("link", { name: button })).toHaveAttribute("href", href);
    expect(screen.getByTestId("owner-contact")).toHaveTextContent(mode === "phone" ? "Phone" : "Email");
    expect(screen.queryByTestId("relay-message")).toBeNull();
  });

  // The server already sends no value for these; the page must not show one even if it arrived.
  it.each([
    ["relay", "+54 9 11 5555-0101"],
    ["none", "ana@example.test"],
    ["email", "+54 9 11 5555-0101"],
    ["phone", "ana@example.test"],
  ])("%s mode never shows the value %s", async (mode, value) => {
    mockFetch({ ...RELAY, contact: { mode, value } });
    const { container } = render(<PublicTagPage />);
    await screen.findByText("Rex");
    expect(screen.queryByTestId("owner-contact")).toBeNull();
    expect(container.innerHTML).not.toContain(value);
  });

  it("shows 'tag not active' when the API 404s", async () => {
    mockFetch(null, false);
    render(<PublicTagPage />);
    expect(await screen.findByText("Tag not active")).toBeInTheDocument();
  });
});

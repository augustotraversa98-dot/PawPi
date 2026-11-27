import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "sonner";
import ClinicalShareOffers from "./ClinicalShareOffers";

const offer = (over) => ({
  id: 5,
  pet_name: "Rex",
  owner_name: "Olivia Owner",
  sections: ["vaccines", "vet_notes"],
  expiry: "30d",
  created_at: "2026-11-26T12:00:00Z",
  lapses_at: "2026-12-03T12:00:00Z",
  ...over,
});
const reply = (body, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

let offers;
let onPost;
let fetchMock;
beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/provider/clinical?lang=en");
  offers = [offer()];
  onPost = () => {
    offers = [];
    return reply({ status: "accepted", pet_id: 1, pet_name: "Rex" });
  };
  fetchMock = vi.fn((url, init) => (init?.method === "POST" ? onPost() : reply({ available: true, offers })));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const open = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ClinicalShareOffers providerId={3} />
    </QueryClientProvider>,
  );
const writes = () =>
  fetchMock.mock.calls.filter(([, init]) => init?.method).map(([url, init]) => [url, JSON.parse(init.body)]);

describe("invitations on the Clinical screen", () => {
  it("shows only the pet, the owner, the parts, how long and the date to answer by", async () => {
    open();
    const card = await screen.findByTestId("share-offer-5");
    expect(card).toHaveTextContent("Rex");
    expect(card).toHaveTextContent("From Olivia Owner");
    expect(card).toHaveTextContent("Parts they want to share: Vaccinations, Vet notes");
    expect(card).toHaveTextContent("How long: 30 days, from when you accept");
    expect(card).toHaveTextContent("Answer before 2026-12-03");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/providers/3/share-offers");
  });

  it.each([
    ["Accept", "accept", "accepted", "Accepted. Rex is now under “Shared with us”."],
    ["Decline", "decline", "declined", "Invitation declined. Nothing was shared."],
  ])("%s answers once, also on a double click", async (button, action, status, message) => {
    onPost = () => {
      offers = [];
      return reply({ status });
    };
    open();
    const control = await screen.findByRole("button", { name: button });
    fireEvent.click(control);
    fireEvent.click(control);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(message));
    expect(writes()).toEqual([["/api/providers/3/share-offers/5", { action }]]);
    await waitFor(() => expect(screen.queryByTestId("share-offer-5")).toBeNull());
  });

  it.each([
    [{ code: "offer_not_open" }, "This invitation is no longer waiting."],
    [{ code: "not_eligible" }, "Only a published vet business can accept this invitation."],
    [{}, "Couldn't answer the invitation"],
  ])("explains a refused answer %o", async (body, message) => {
    onPost = () => reply(body, 409);
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error.mock.calls[0][0]).toBe(message);
  });

  it("shows nothing when there are no invitations, or the server cannot list them yet", async () => {
    offers = [];
    const { container } = open();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("speaks Spanish (voseo), with a neutral word for an owner without a name", async () => {
    window.history.replaceState(null, "", "/provider/clinical?lang=es");
    offers = [offer({ owner_name: null, expiry: "until_revoked" })];
    open();
    const card = await screen.findByTestId("share-offer-5");
    expect(card).toHaveTextContent("De un dueño");
    expect(card).toHaveTextContent("Hasta que el dueño lo termine");
    expect(card).toHaveTextContent("Respondé antes del 03/12/2026");
  });
});

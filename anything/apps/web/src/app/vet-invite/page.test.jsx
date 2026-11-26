import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const userState = vi.hoisted(() => ({ user: null, loading: false }));
vi.mock("@/utils/useUser", () => ({ default: () => userState }));
vi.mock("@/components/brand/BrandLockup", () => ({ default: () => null }));

import VetInvitePage, { INVITE_STORAGE_KEY } from "./page";
import { VET_INVITE_COPY } from "@/lib/vetInvite/copy";
import { isPrivateLinkPath } from "@/lib/home/meta";

const TOKEN = "t".repeat(43);
const t = VET_INVITE_COPY.en;
const invite = { petName: "Rex", ownerName: "Olivia", expiresAt: "2026-12-03T12:00:00Z" };
const answer = (status, data) => Promise.resolve({ status, json: () => Promise.resolve(data) });
const ready = (businesses = [{ id: 1, name: "Clinic One" }]) => answer(200, { invite, businesses });

let fetchMock;
beforeEach(() => {
  userState.user = { id: 3 };
  userState.loading = false;
  window.sessionStorage.clear();
  window.history.replaceState(null, "", `/vet-invite?lang=en#${TOKEN}`);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const sentTo = () => fetchMock.mock.calls.map(([url]) => url);

describe("vet invite page", () => {
  it("takes the token out of the address bar and sends it only in a request body", async () => {
    fetchMock.mockReturnValueOnce(ready());
    render(<VetInvitePage />);
    await screen.findByRole("button", { name: t.invite.accept });

    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain(TOKEN);
    expect(sentTo()).toEqual(["/api/care-access/invites/preview"]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: TOKEN });
    expect(document.body.innerHTML).not.toContain(TOKEN);
    expect(document.head.querySelector('meta[name="referrer"]').content).toBe("no-referrer");
  });

  it("signed out: asks to sign in, makes no request and keeps the token out of every link", () => {
    userState.user = null;
    render(<VetInvitePage />);

    expect(screen.getByText(t.signedOut.title)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.signedOut.signIn })).toHaveAttribute(
      "href",
      "/account/signin?callbackUrl=%2Fvet-invite",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(INVITE_STORAGE_KEY)).toBe(TOKEN);
    expect(document.body.innerHTML).not.toContain(TOKEN);
  });

  it("after signing in, uses the token kept for this tab", async () => {
    window.sessionStorage.setItem(INVITE_STORAGE_KEY, TOKEN);
    window.history.replaceState(null, "", "/vet-invite?lang=en");
    fetchMock.mockReturnValueOnce(ready());
    render(<VetInvitePage />);

    await screen.findByRole("button", { name: t.invite.accept });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: TOKEN });
  });

  it("without a link: says to open it", () => {
    window.history.replaceState(null, "", "/vet-invite?lang=en");
    render(<VetInvitePage />);
    expect(screen.getByText(t.noLink.title)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [403, { code: "no_business" }, t.noBusiness.title],
    [404, { code: "invite_not_valid" }, t.invalid.title],
    [429, { code: "rate_limited" }, t.errors.tooMany],
    [500, null, t.errors.generic],
  ])("answer %s shows the matching screen", async (status, data, text) => {
    fetchMock.mockReturnValueOnce(answer(status, data));
    render(<VetInvitePage />);
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it("asks which clinic when there are several, then reports the request", async () => {
    fetchMock
      .mockReturnValueOnce(ready([{ id: 1, name: "Clinic One" }, { id: 2, name: "Clinic Two" }]))
      .mockReturnValueOnce(answer(200, { status: "requested", petName: "Rex" }));
    render(<VetInvitePage />);

    const button = await screen.findByRole("button", { name: t.invite.accept });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "2" } });
    fireEvent.click(button);

    expect(await screen.findByText(t.requested.title)).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ token: TOKEN, providerId: 2 });
    expect(window.sessionStorage.getItem(INVITE_STORAGE_KEY)).toBeNull();
  });

  it("says when the clinic already has a request or access", async () => {
    fetchMock
      .mockReturnValueOnce(ready())
      .mockReturnValueOnce(answer(200, { status: "already_open", petName: "Rex" }));
    render(<VetInvitePage />);
    fireEvent.click(await screen.findByRole("button", { name: t.invite.accept }));
    expect(await screen.findByText(t.alreadyOpen.title)).toBeInTheDocument();
    await waitFor(() => expect(sentTo()).toHaveLength(2));
  });

  it("speaks es-AR", async () => {
    window.history.replaceState(null, "", `/vet-invite?lang=es#${TOKEN}`);
    fetchMock.mockReturnValueOnce(ready());
    render(<VetInvitePage />);
    expect(await screen.findByRole("button", { name: VET_INVITE_COPY.es.invite.accept })).toBeInTheDocument();
  });

  it("both languages carry the same copy keys", () => {
    const keys = (node, at = "") =>
      Object.entries(node).flatMap(([k, v]) => (typeof v === "string" ? [`${at}${k}`] : keys(v, `${at}${k}.`)));
    expect(keys(VET_INVITE_COPY.es).sort()).toEqual(keys(VET_INVITE_COPY.en).sort());
  });

  it("is a private-link page for search engines", () => {
    expect(isPrivateLinkPath("/vet-invite")).toBe(true);
    expect(isPrivateLinkPath("/vet-invites-blog")).toBe(false);
  });
});

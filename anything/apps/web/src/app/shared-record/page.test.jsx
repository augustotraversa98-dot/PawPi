import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const userState = vi.hoisted(() => ({ user: null, loading: false }));
vi.mock("@/utils/useUser", () => ({ default: () => userState }));
vi.mock("@/components/brand/BrandLockup", () => ({ default: () => null }));

import SharedRecordPage, { RECORD_LINK_STORAGE_KEY } from "./page";
import { RECORD_LINK_COPY } from "@/lib/recordLink/copy";
import { RECORD_COPY } from "@/app/provider/lib/recordCopy";
import { documentLang, isPrivateLinkPath } from "@/lib/home/meta";

const TOKEN = "r".repeat(43);
const t = RECORD_LINK_COPY.en;
const record = (over = {}) => ({
  pet_name: "Rex",
  owner_name: "Olivia",
  expires_at: "2026-12-03T12:00:00Z",
  allow_notes: false,
  sections: ["vet_notes", "files"],
  profile: null,
  emergency_contact: null,
  insurance: null,
  vet_notes: [
    { note_date: "2026-11-20", note: "Owner note", vet_name: null, via_link: false, external_author_name: null },
    { note_date: "2026-11-21", note: "Outside note", vet_name: "Cambios de alguien externo", via_link: true, external_author_name: null },
    { note_date: "2026-11-22", note: "Named note", vet_name: "Dr. Gómez", via_link: true, external_author_name: "Dr. Gómez" },
  ],
  vaccines: null,
  files: [
    { id: 4, name: "Blood test", document_type: "lab", document_date: null, notes: null, file_available: true },
    { id: 5, name: "Old paper", document_type: "other", document_date: null, notes: null, file_available: false },
  ],
  photos: null,
  lab_results: null,
  ...over,
});
const answer = (status, data) => Promise.resolve({ status, json: () => Promise.resolve(data) });

let fetchMock;
beforeEach(() => {
  userState.user = null;
  window.sessionStorage.clear();
  window.history.replaceState(null, "", `/shared-record?lang=en#${TOKEN}`);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const calls = () => fetchMock.mock.calls.map(([url, init]) => [url, JSON.parse(init.body), init.credentials]);

async function open(over) {
  fetchMock.mockReturnValueOnce(answer(200, { record: record(over) }));
  const view = render(<SharedRecordPage />);
  await screen.findByRole("heading", { name: "Rex's vet record" });
  return view;
}

describe("shared record page", () => {
  it("is marked as a private link page, so it is not indexed", () => {
    expect(isPrivateLinkPath("/shared-record")).toBe(true);
    expect(isPrivateLinkPath("/shared-records")).toBe(false);
    // <html lang> follows the viewer, Spanish when nothing says otherwise.
    expect(documentLang("/shared-record", "")).toBe("es-AR");
    expect(documentLang("/shared-record", "?lang=en")).toBe("en");
  });

  it("takes the token out of the address bar and sends it only in a request body, with no cookie", async () => {
    await open();
    expect(window.location.hash).toBe("");
    expect(calls()).toEqual([["/api/public/record-link/open", { token: TOKEN }, "omit"]]);
    expect(document.body.innerHTML).not.toContain(TOKEN);
    expect(document.head.querySelector('meta[name="referrer"]').content).toBe("no-referrer");
    expect(window.sessionStorage.getItem(RECORD_LINK_STORAGE_KEY)).toBe(TOKEN);
  });

  it("shows only the shared parts and says who added each note", async () => {
    await open();
    expect(screen.getByTestId("link-sections")).toHaveTextContent("Vet notes, Files");
    expect(screen.getByText("Shared by Olivia")).toBeInTheDocument();
    const notes = within(screen.getByRole("region", { name: RECORD_COPY.en.sections.vet_notes }));
    expect(notes.getByText("2026-11-20 · Owner")).toBeInTheDocument();
    expect(notes.getByText("2026-11-21 · Anonymous · Added through a shared link")).toBeInTheDocument();
    expect(notes.getByText("2026-11-22 · Dr. Gómez · Added through a shared link")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: RECORD_COPY.en.sections.vaccines })).toBeNull();
    expect(screen.queryByRole("region", { name: RECORD_COPY.en.sections.profile })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("asks for a file only when asked, and says when one is not available", async () => {
    await open();
    expect(screen.getByText(t.files.unavailable)).toBeInTheDocument();
    fetchMock.mockReturnValueOnce(answer(200, { url: "https://storage.example.test/signed", expiresIn: 60 }));
    fireEvent.click(screen.getByRole("button", { name: t.files.get }));
    const link = await screen.findByRole("link", { name: t.files.open });
    expect(link).toHaveAttribute("href", "https://storage.example.test/signed");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(calls()[1]).toEqual(["/api/public/record-link/file", { token: TOKEN, kind: "document", id: 4 }, "omit"]);
  });

  it("without a link: says to open it and requests nothing", () => {
    window.history.replaceState(null, "", "/shared-record?lang=en");
    render(<SharedRecordPage />);
    expect(screen.getByText(t.noLink.title)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an unusable link shows one message and forgets the token", async () => {
    fetchMock.mockReturnValueOnce(answer(403, { code: "link_not_valid" }));
    render(<SharedRecordPage />);
    await screen.findByText(t.unavailable.title);
    expect(window.sessionStorage.getItem(RECORD_LINK_STORAGE_KEY)).toBeNull();
  });

  it("after a reload, uses the token kept for this tab", async () => {
    window.sessionStorage.setItem(RECORD_LINK_STORAGE_KEY, TOKEN);
    window.history.replaceState(null, "", "/shared-record?lang=en");
    await open();
    expect(calls()[0][1]).toEqual({ token: TOKEN });
  });

  it("signed out: says the note will be anonymous and offers signing in without the token", async () => {
    await open({ allow_notes: true });
    expect(screen.getByTestId("note-author")).toHaveTextContent("your note will show as “Anonymous”");
    expect(screen.getByRole("link", { name: t.notes.signIn })).toHaveAttribute(
      "href",
      "/account/signin?callbackUrl=%2Fshared-record",
    );
  });

  it("signed in: sends the note once with the session, then reads the record again", async () => {
    userState.user = { id: 3 };
    await open({ allow_notes: true });
    expect(screen.getByTestId("note-author")).toHaveTextContent(t.notes.signedIn);
    let finish;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    fetchMock.mockReturnValueOnce(answer(200, { record: record({ allow_notes: true }) }));
    fireEvent.change(screen.getByLabelText(t.notes.label), { target: { value: "  All good  " } });
    const form = screen.getByLabelText(t.notes.label).closest("form");
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(calls()[1]).toEqual(["/api/public/record-link/notes", { token: TOKEN, note: "All good" }, "same-origin"]);
    finish({ status: 201, json: () => Promise.resolve({ note: {} }) });
    await screen.findByText(t.notes.added);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(screen.getByLabelText(t.notes.label)).toHaveValue("");
  });

  it.each([
    [429, "note_limit", t.notes.limit],
    [429, "rate_limited", t.errors.tooMany],
    [403, "notes_not_allowed", t.notes.notAllowed],
    [401, "session_expired", t.notes.sessionEnded],
    [500, undefined, t.notes.failed],
  ])("explains a refused note (%s %s) and keeps the text", async (status, code, message) => {
    await open({ allow_notes: true });
    fetchMock.mockReturnValueOnce(answer(status, { code }));
    fireEvent.change(screen.getByLabelText(t.notes.label), { target: { value: "Keep me" } });
    fireEvent.click(screen.getByRole("button", { name: t.notes.add }));
    await screen.findByText(message);
    expect(screen.getByLabelText(t.notes.label)).toHaveValue("Keep me");
  });

  it("a link removed while the page is open: the next call clears the record", async () => {
    await open({ allow_notes: true });
    fetchMock.mockReturnValueOnce(answer(403, { code: "link_not_valid" }));
    fireEvent.change(screen.getByLabelText(t.notes.label), { target: { value: "Late" } });
    fireEvent.click(screen.getByRole("button", { name: t.notes.add }));
    await screen.findByText(t.unavailable.title);
    expect(document.body.textContent).not.toContain("Owner note");
  });

  it("speaks Spanish (voseo), with the outside label for an unnamed note", async () => {
    window.history.replaceState(null, "", `/shared-record?lang=es#${TOKEN}`);
    fetchMock.mockReturnValueOnce(answer(200, { record: record({ allow_notes: true }) }));
    render(<SharedRecordPage />);
    await screen.findByRole("heading", { name: "Ficha veterinaria de Rex" });
    expect(screen.getByText(/Cambios de alguien externo · Agregada desde un enlace compartido/)).toBeInTheDocument();
    expect(screen.getByTestId("note-author")).toHaveTextContent("No iniciaste sesión");
  });

  it("keeps both languages in step", () => {
    const shape = (value) =>
      typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)])) : "text";
    expect(shape(RECORD_LINK_COPY.es)).toEqual(shape(RECORD_LINK_COPY.en));
  });
});

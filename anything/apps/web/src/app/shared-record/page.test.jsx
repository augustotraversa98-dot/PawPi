import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const userState = vi.hoisted(() => ({ user: null, loading: false }));
vi.mock("@/utils/useUser", () => ({ default: () => userState }));
vi.mock("@/components/brand/BrandLockup", () => ({ default: () => null }));

import SharedRecordPage from "./page";
import { RETURN_KEY_PREFIX } from "@/components/recordLink/signInReturn";
import { RECORD_LINK_COPY } from "@/lib/recordLink/copy";
import recordCopy from "@/app/provider/i18n/record";
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

  it("keeps the token in this page's address, sends it only in a request body, with no cookie, and stores it nowhere", async () => {
    await open();
    expect(window.location.hash).toBe(`#${TOKEN}`);
    expect(calls()).toEqual([["/api/public/record-link/open", { token: TOKEN }, "omit"]]);
    expect(document.body.innerHTML).not.toContain(TOKEN);
    expect(document.head.querySelector('meta[name="referrer"]').content).toBe("no-referrer");
    expect(window.sessionStorage.length).toBe(0);
  });

  it("names the pet in the tab title, so several open links can be told apart", async () => {
    await open();
    expect(document.title).toBe(`Rex · ${t.documentTitle}`);
  });

  it("shows only the shared parts and says who added each note", async () => {
    await open();
    expect(screen.getByTestId("link-sections")).toHaveTextContent("Vet notes, Files");
    expect(screen.getByText("Shared by Olivia")).toBeInTheDocument();
    const notes = within(screen.getByRole("region", { name: recordCopy.en.sections.vet_notes }));
    expect(notes.getByText("2026-11-20 · Owner")).toBeInTheDocument();
    expect(notes.getByText("2026-11-21 · Anonymous · Added through a shared link")).toBeInTheDocument();
    expect(notes.getByText("2026-11-22 · Dr. Gómez · Added through a shared link")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: recordCopy.en.sections.vaccines })).toBeNull();
    expect(screen.queryByRole("region", { name: recordCopy.en.sections.profile })).toBeNull();
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

  it("an unusable link shows one message", async () => {
    fetchMock.mockReturnValueOnce(answer(403, { code: "link_not_valid" }));
    render(<SharedRecordPage />);
    await screen.findByText(t.unavailable.title);
  });

  it("opens the record the address names, whatever this tab showed before", async () => {
    const first = await open();
    first.unmount();
    // The same tab, now at an address without a link: it must not bring the earlier pet back.
    window.history.replaceState(null, "", "/shared-record?lang=en");
    render(<SharedRecordPage />);
    expect(screen.getByText(t.noLink.title)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("moving to another link in the same tab shows only that pet", async () => {
    await open();
    const other = "s".repeat(43);
    let finish;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    window.history.pushState(null, "", `/shared-record?lang=en#${other}`);
    fireEvent(window, new HashChangeEvent("hashchange"));
    // While the other record is being read nothing of the first one stays up.
    await screen.findByText(t.loading);
    expect(document.body.textContent).not.toContain("Owner note");
    finish({ status: 200, json: () => Promise.resolve({ record: record({ pet_name: "Duke" }) }) });
    await screen.findByRole("heading", { name: "Duke's vet record" });
    expect(calls()[1][1]).toEqual({ token: other });
  });

  it("signed out: says the note will be anonymous and offers signing in without the token", async () => {
    await open({ allow_notes: true });
    expect(screen.getByTestId("note-author")).toHaveTextContent("your note will show as “Anonymous”");
    const signIn = screen.getByRole("link", { name: t.notes.signIn });
    const href = signIn.getAttribute("href");
    expect(href).toMatch(/^\/account\/signin\?callbackUrl=%2Fshared-record%3Freturn%3D[\w-]+$/);
    expect(href).not.toContain(TOKEN);
    signIn.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(signIn);
    const id = new URL(href, "https://x.test").searchParams.get("callbackUrl").split("return=")[1];
    expect(window.sessionStorage.getItem(RETURN_KEY_PREFIX + id)).toBe(TOKEN);
  });

  it("coming back from signing in: puts the link back in the address and forgets the kept copy", async () => {
    window.sessionStorage.setItem(`${RETURN_KEY_PREFIX}abc`, TOKEN);
    window.sessionStorage.setItem(`${RETURN_KEY_PREFIX}other`, "s".repeat(43));
    window.history.replaceState(null, "", "/shared-record?lang=en&return=abc");
    await open();
    expect(calls()[0][1]).toEqual({ token: TOKEN });
    expect(window.location.hash).toBe(`#${TOKEN}`);
    expect(window.location.search).toBe("?lang=en");
    expect(window.sessionStorage.getItem(`${RETURN_KEY_PREFIX}abc`)).toBeNull();
    expect(window.sessionStorage.getItem(`${RETURN_KEY_PREFIX}other`)).not.toBeNull();
  });

  const linkNote = (over = {}) => ({
    id: 7, note_date: "2026-11-23", note: "First draft", external_author_name: null,
    edited_at: null, editable: true, needs_sign_in: false, ...over,
  });

  it("a link that only allows notes shows the ones added through it, and saves a correction", async () => {
    await open({ allow_notes: true, sections: ["files"], vet_notes: null, link_notes: [linkNote()] });
    const own = within(screen.getByRole("region", { name: t.notes.linkNotesTitle }));
    expect(own.getByText("First draft")).toBeInTheDocument();
    fetchMock.mockReturnValueOnce(answer(200, { note: { id: 7 } }));
    fetchMock.mockReturnValueOnce(
      answer(200, {
        record: record({
          allow_notes: true, sections: ["files"], vet_notes: null,
          link_notes: [linkNote({ note: "Corrected", edited_at: "2026-11-24T10:00:00Z" })],
        }),
      }),
    );
    fireEvent.click(own.getByRole("button", { name: t.notes.edit }));
    expect(screen.getByLabelText(t.notes.editLabel)).toHaveValue("First draft");
    fireEvent.change(screen.getByLabelText(t.notes.editLabel), { target: { value: " Corrected " } });
    fireEvent.click(screen.getByRole("button", { name: t.notes.save }));
    await screen.findByText("Corrected");
    expect(fetchMock.mock.calls[1][1].method).toBe("PATCH");
    expect(calls()[1]).toEqual([
      "/api/public/record-link/notes", { token: TOKEN, noteId: 7, note: "Corrected" }, "same-origin",
    ]);
    expect(screen.getByText(/Edited /)).toBeInTheDocument();
  });

  it("with the notes shared, only the link's own editable note can be edited", async () => {
    await open({
      allow_notes: true,
      vet_notes: [
        { note_date: "2026-11-20", note: "Owner note", vet_name: null, via_link: false, link_note_id: null },
        { note_date: "2026-11-23", note: "First draft", via_link: true, link_note_id: 7 },
      ],
      link_notes: [linkNote()],
    });
    expect(screen.getAllByRole("button", { name: t.notes.edit })).toHaveLength(1);
    expect(screen.queryByRole("region", { name: t.notes.linkNotesTitle })).toBeNull();
  });

  it("a note written signed in asks to sign in instead of offering an edit", async () => {
    await open({
      allow_notes: true, sections: ["files"], vet_notes: null,
      link_notes: [linkNote({ editable: false, needs_sign_in: true, external_author_name: "Dr. Gómez" })],
    });
    expect(screen.queryByRole("button", { name: t.notes.edit })).toBeNull();
    expect(screen.getByRole("link", { name: t.notes.signInShort })).toBeInTheDocument();
  });

  it("keeps the correction on screen when it could not be saved", async () => {
    await open({ allow_notes: true, sections: ["files"], vet_notes: null, link_notes: [linkNote()] });
    fetchMock.mockReturnValueOnce(answer(500, {}));
    fireEvent.click(screen.getByRole("button", { name: t.notes.edit }));
    fireEvent.change(screen.getByLabelText(t.notes.editLabel), { target: { value: "Keep this" } });
    fireEvent.click(screen.getByRole("button", { name: t.notes.save }));
    await screen.findByText(t.notes.editFailed);
    expect(screen.getByLabelText(t.notes.editLabel)).toHaveValue("Keep this");
  });

  it("signed in: reads the record with the session, and still opens it if the session stopped working", async () => {
    userState.user = { id: 3 };
    fetchMock.mockReturnValueOnce(answer(401, {}));
    await open();
    expect(calls().map((c) => c[2])).toEqual(["same-origin", "omit"]);
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

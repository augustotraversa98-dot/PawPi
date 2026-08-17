import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

// MOD2 PR1 — the enriched moderation console. All data + gating come from the admin-only endpoint
// (app_admin_list_reports_v2, 0116), mocked here via global.fetch so the test isolates: the admin
// gate (403 → no data leak), the triage-card render (content preview, author, reporter, count,
// exact timestamp), a polymorphic-fallback row (no preview/author → clean fallback, never blank),
// the EN/ES toggle, and that an action POSTs to the action route + refreshes.

import ModerationConsole from "./ModerationConsole";

const FILED = new Date().toISOString();
const POSTED = new Date("2026-08-16T21:45:00Z").toISOString();

// Two reports on the SAME post (post #5), enriched shape from v2.
const OPEN_REPORTS = [
  {
    id: 1,
    target_type: "post",
    target_id: 5,
    reason: "spam",
    details: "looks like spam",
    status: "open",
    created_at: FILED,
    target_created_at: POSTED,
    reporter_id: 71,
    reporter_handle: "reporter_a",
    reporters_count: 2,
    author_id: 11,
    author_handle: "baddog",
    preview_text: "buy cheap followers now",
    preview_image_url: "https://example.com/x.jpg",
  },
  {
    id: 2,
    target_type: "post",
    target_id: 5,
    reason: "harassment",
    details: null,
    status: "open",
    created_at: FILED,
    target_created_at: POSTED,
    reporter_id: 72,
    reporter_handle: "reporter_b",
    reporters_count: 2,
    author_id: 11,
    author_handle: "baddog",
    preview_text: "buy cheap followers now",
    preview_image_url: "https://example.com/x.jpg",
  },
];

// A preview-less type (user_profile) with no resolvable author/handle — the polymorphic fallback.
const NO_PREVIEW = [
  {
    id: 9,
    target_type: "user_profile",
    target_id: 3,
    reason: "other",
    details: null,
    status: "open",
    created_at: FILED,
    target_created_at: null,
    reporter_id: 5,
    reporter_handle: null,
    reporters_count: 1,
    author_id: null,
    author_handle: null,
    preview_text: null,
    preview_image_url: null,
  },
];

function mockFetch(handler) {
  global.fetch = vi.fn(handler);
}
const jsonRes = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  delete global.fetch;
});

describe("ModerationConsole — admin gate", () => {
  it("a non-admin (403) sees a no-access state and NO report data", async () => {
    mockFetch(async () => jsonRes(403, { error: "Forbidden" }));
    render(<ModerationConsole />);
    expect(
      await screen.findByText(/don't have access to the moderation console/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("report-card")).not.toBeInTheDocument();
  });

  it("an unauthenticated caller (401) is prompted to sign in", async () => {
    mockFetch(async () => jsonRes(401, { error: "Unauthorized" }));
    render(<ModerationConsole />);
    expect(await screen.findByText(/please sign in/i)).toBeInTheDocument();
    expect(screen.getByText(/go to sign in/i).closest("a")).toHaveAttribute(
      "href",
      "/account/signin",
    );
  });
});

describe("ModerationConsole — triage card render", () => {
  it("shows the content preview, author, reporter, reason and the distinct-reporter count", async () => {
    mockFetch(async () => jsonRes(200, { reports: OPEN_REPORTS }));
    render(<ModerationConsole />);

    const cards = await screen.findAllByTestId("report-card");
    expect(cards).toHaveLength(2);
    const c0 = cards[0];
    expect(within(c0).getByText("post #5")).toBeInTheDocument();
    // the actual reported content is visible
    expect(c0).toHaveTextContent(/buy cheap followers now/i);
    // reported author + reporter handles
    expect(c0).toHaveTextContent(/reported author:\s*@baddog/i);
    expect(c0).toHaveTextContent(/reported by:\s*@reporter_a/i);
    expect(c0).toHaveTextContent(/reason:\s*spam/i);
    // server-provided distinct-reporter count (pile-on) is shown
    expect(within(c0).getByText(/2 reporters on this target/i)).toBeInTheDocument();
    // an exact absolute timestamp for when the content was posted (16 Aug 2026)
    expect(c0).toHaveTextContent(/16 Aug 2026/i);
    // thumbnail rendered from the preview image url (decorative alt="" → query by tag)
    expect(c0.querySelector("img")).toHaveAttribute("src", "https://example.com/x.jpg");
    // Open tab shows the count
    expect(screen.getByRole("tab", { name: /open \(2\)/i })).toBeInTheDocument();
  });

  it("renders a clean fallback for a preview-less type (no crash, no blank)", async () => {
    mockFetch(async () => jsonRes(200, { reports: NO_PREVIEW }));
    render(<ModerationConsole />);
    const card = await screen.findByTestId("report-card");
    expect(within(card).getByText("user_profile #3")).toBeInTheDocument();
    expect(card).toHaveTextContent(/no text preview/i);
    // unresolved author/reporter degrade to a neutral label, never blank
    expect(card).toHaveTextContent(/reported author:\s*@unknown/i);
    // no thumbnail when there is no image
    expect(card.querySelector("img")).toBeNull();
  });
});

describe("ModerationConsole — i18n", () => {
  it("defaults to English and toggles to Spanish", async () => {
    mockFetch(async () => jsonRes(200, { reports: OPEN_REPORTS }));
    render(<ModerationConsole />);
    await screen.findAllByTestId("report-card");
    expect(screen.getByRole("heading", { name: /moderation queue/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /toggle language/i }));
    expect(screen.getByRole("heading", { name: /cola de moderación/i })).toBeInTheDocument();
    // an action label is translated too
    expect(screen.getAllByRole("button", { name: /quitar contenido/i })[0]).toBeInTheDocument();
  });
});

describe("ModerationConsole — actions", () => {
  it("Remove content POSTs action=remove (ban=false) then refreshes", async () => {
    const calls = [];
    mockFetch(async (url, opts) => {
      calls.push({ url, opts });
      if (opts?.method === "POST") return jsonRes(200, { actioned: true });
      return jsonRes(200, { reports: OPEN_REPORTS });
    });
    render(<ModerationConsole />);
    const cards = await screen.findAllByTestId("report-card");
    fireEvent.click(within(cards[0]).getByRole("button", { name: /remove content/i }));

    await waitFor(() => {
      const post = calls.find((c) => c.opts?.method === "POST");
      expect(post).toBeTruthy();
      expect(post.url).toBe("/api/admin/reports/1/action");
      expect(JSON.parse(post.opts.body)).toEqual({ action: "remove", ban: false });
    });
    // A GET fired after the POST (refresh).
    const postIdx = calls.findIndex((c) => c.opts?.method === "POST");
    expect(calls.slice(postIdx + 1).some((c) => c.opts?.method !== "POST")).toBe(true);
  });

  it("checking Ban makes Remove send ban=true", async () => {
    const calls = [];
    mockFetch(async (url, opts) => {
      calls.push({ url, opts });
      if (opts?.method === "POST") return jsonRes(200, { actioned: true });
      return jsonRes(200, { reports: OPEN_REPORTS });
    });
    render(<ModerationConsole />);
    const cards = await screen.findAllByTestId("report-card");
    fireEvent.click(within(cards[0]).getByRole("checkbox"));
    fireEvent.click(within(cards[0]).getByRole("button", { name: /remove content/i }));

    await waitFor(() => {
      const post = calls.find((c) => c.opts?.method === "POST");
      expect(JSON.parse(post.opts.body)).toEqual({ action: "remove", ban: true });
    });
  });

  it("Dismiss POSTs action=dismiss", async () => {
    const calls = [];
    mockFetch(async (url, opts) => {
      calls.push({ url, opts });
      if (opts?.method === "POST") return jsonRes(200, { actioned: true });
      return jsonRes(200, { reports: OPEN_REPORTS });
    });
    render(<ModerationConsole />);
    const cards = await screen.findAllByTestId("report-card");
    fireEvent.click(within(cards[0]).getByRole("button", { name: /^dismiss$/i }));

    await waitFor(() => {
      const post = calls.find((c) => c.opts?.method === "POST");
      expect(post.url).toBe("/api/admin/reports/1/action");
      expect(JSON.parse(post.opts.body)).toEqual({ action: "dismiss", ban: false });
    });
  });

  it("surfaces a server error from an action without crashing", async () => {
    mockFetch(async (url, opts) => {
      if (opts?.method === "POST") return jsonRes(404, { error: "Report not found" });
      return jsonRes(200, { reports: OPEN_REPORTS });
    });
    render(<ModerationConsole />);
    const cards = await screen.findAllByTestId("report-card");
    fireEvent.click(within(cards[0]).getByRole("button", { name: /remove content/i }));
    expect(await screen.findByText(/report not found/i)).toBeInTheDocument();
  });
});

describe("ModerationConsole — status filter", () => {
  it("switching to Dismissed refetches with ?status=dismissed", async () => {
    const urls = [];
    mockFetch(async (url) => {
      urls.push(url);
      return jsonRes(200, { reports: [] });
    });
    render(<ModerationConsole />);
    await screen.findByText(/queue is empty/i);
    fireEvent.click(screen.getByRole("tab", { name: /dismissed/i }));
    await waitFor(() => {
      expect(urls.some((u) => u.includes("status=dismissed"))).toBe(true);
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

// MOD1 PR2 — the moderation console. All data + gating come from the admin-only endpoints, which
// are mocked here via global.fetch so the test isolates: the admin gate (403 → no data leak),
// the list render, and that an action POSTs to the action route + refreshes the queue.

import ModerationConsole from "./ModerationConsole";

const OPEN_REPORTS = [
  {
    id: 1,
    target_type: "post",
    target_id: 5,
    reason: "spam",
    details: "looks like spam",
    status: "open",
    created_at: new Date().toISOString(),
  },
  {
    id: 2,
    target_type: "post",
    target_id: 5, // same target as #1 → reporter count 2
    reason: "harassment",
    details: null,
    status: "open",
    created_at: new Date().toISOString(),
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

describe("ModerationConsole — list render", () => {
  it("an admin sees the queue, target, reason and the reporter count", async () => {
    mockFetch(async () => jsonRes(200, { reports: OPEN_REPORTS }));
    render(<ModerationConsole />);

    const cards = await screen.findAllByTestId("report-card");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText("post #5")).toBeInTheDocument();
    expect(cards[0]).toHaveTextContent(/reason:\s*spam/i);
    // both reports share target post#5 → the count badge shows 2
    expect(within(cards[0]).getByText(/2 reports on this target/i)).toBeInTheDocument();
    // Open tab shows the count
    expect(screen.getByRole("tab", { name: /open \(2\)/i })).toBeInTheDocument();
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
    fireEvent.click(within(cards[0]).getByRole("button", { name: /dismiss/i }));

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

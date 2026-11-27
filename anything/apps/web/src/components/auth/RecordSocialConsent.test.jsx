import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

// The website's Terms acceptance for Google / Apple / Microsoft: written once, only after the person clicked under the
// line and came back signed in.

let status = "authenticated";
vi.mock("@auth/create/react", () => ({ useSession: () => ({ status }) }));

import RecordSocialConsent, { rememberSocialConsent } from "./RecordSocialConsent";

beforeEach(() => {
  status = "authenticated";
  window.localStorage.clear();
  global.fetch = vi.fn().mockResolvedValue({ ok: true });
});
afterEach(() => {
  vi.useRealTimers();
  delete global.fetch;
});

describe("RecordSocialConsent", () => {
  it("records the acceptance once the session exists, and only once", () => {
    rememberSocialConsent();
    render(<RecordSocialConsent />);
    render(<RecordSocialConsent />);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/legal/consent");
    expect(JSON.parse(init.body)).toEqual({ source: "web_social" });
  });

  it("writes nothing for someone who did not click one of those buttons", () => {
    render(<RecordSocialConsent />);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("waits while there is no session yet", () => {
    status = "unauthenticated";
    rememberSocialConsent();
    render(<RecordSocialConsent />);
    expect(global.fetch).not.toHaveBeenCalled();
    status = "authenticated";
    render(<RecordSocialConsent />);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("forgets an attempt that was abandoned", () => {
    vi.useFakeTimers();
    rememberSocialConsent();
    vi.advanceTimersByTime(11 * 60 * 1000);
    render(<RecordSocialConsent />);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

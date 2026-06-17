import { describe, it, expect } from "vitest";
import { resolveHomeView } from "./resolveHomeView";

describe("resolveHomeView", () => {
  it("renders nothing while the session is loading (no flash)", () => {
    expect(resolveHomeView({ loading: true, user: null })).toBe("loading");
    // loading wins even if a stale user object is present
    expect(resolveHomeView({ loading: true, user: { id: 1 } })).toBe("loading");
  });

  it("redirects a logged-in visitor to /provider", () => {
    expect(resolveHomeView({ loading: false, user: { id: 1 } })).toBe(
      "redirect",
    );
  });

  it("shows the landing for a logged-out visitor", () => {
    expect(resolveHomeView({ loading: false, user: null })).toBe("landing");
  });
});

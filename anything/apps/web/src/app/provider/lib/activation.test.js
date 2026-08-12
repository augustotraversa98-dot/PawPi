import { describe, it, expect } from "vitest";
import {
  computeProviderActivation,
  PROVIDER_ACTIVATION_ITEMS,
} from "./activation";

const fullProvider = { logo_url: "https://x/logo.png", bio: "We love pets" };

describe("computeProviderActivation", () => {
  it("all-undone (nothing set up) → 0%", () => {
    const a = computeProviderActivation({});
    expect(a.total).toBe(5);
    expect(a.completed).toBe(0);
    expect(a.percent).toBe(0);
    expect(a.isComplete).toBe(false);
    expect(a.items.map((i) => i.key)).toEqual(PROVIDER_ACTIVATION_ITEMS);
    expect(a.items.every((i) => i.done === false)).toBe(true);
  });

  it("profile needs BOTH a logo and a non-empty bio", () => {
    const done = (provider) =>
      computeProviderActivation({ provider }).items.find((i) => i.key === "profile").done;
    expect(done(fullProvider)).toBe(true);
    expect(done({ logo_url: "x" })).toBe(false);
    expect(done({ bio: "hi" })).toBe(false);
    expect(done({ logo_url: "x", bio: "   " })).toBe(false);
  });

  it("offering is a service OR a product", () => {
    const off = (extra) => computeProviderActivation(extra).items.find((i) => i.key === "offering").done;
    expect(off({ services: [{ id: 1 }] })).toBe(true);
    expect(off({ products: [{ id: 1 }] })).toBe(true);
    expect(off({ services: [], products: [] })).toBe(false);
  });

  it("hours / location / post each derive from their own list", () => {
    const a = computeProviderActivation({
      windows: [{ id: 1 }],
      locations: [{ id: 2 }],
      posts: [{ id: 3 }],
    });
    const done = Object.fromEntries(a.items.map((i) => [i.key, i.done]));
    expect(done.hours).toBe(true);
    expect(done.location).toBe(true);
    expect(done.post).toBe(true);
    expect(done.profile).toBe(false);
    expect(done.offering).toBe(false);
  });

  it("% math is completed / total, rounded", () => {
    // profile + offering done → 2/5 → 40%.
    const a = computeProviderActivation({ provider: fullProvider, services: [{ id: 1 }] });
    expect(a.completed).toBe(2);
    expect(a.percent).toBe(40);
  });

  it("everything set up → 100% + isComplete", () => {
    const a = computeProviderActivation({
      provider: fullProvider,
      services: [{ id: 1 }],
      windows: [{ id: 2 }],
      locations: [{ id: 3 }],
      posts: [{ id: 4 }],
    });
    expect(a.completed).toBe(5);
    expect(a.percent).toBe(100);
    expect(a.isComplete).toBe(true);
  });
});

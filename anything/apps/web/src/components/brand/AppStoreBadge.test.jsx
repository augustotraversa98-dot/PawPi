import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import AppStoreBadge from "./AppStoreBadge";
import { APP_STORE_ID, appStoreUrl } from "@/lib/brand/tokens";

const root = resolve(__dirname, "../../..");

function renderBadge(url, props) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <AppStoreBadge {...props} />
    </MemoryRouter>,
  );
}

describe("appStoreUrl", () => {
  it("points at the live listing, with the language", () => {
    expect(APP_STORE_ID).toBe("6785949610");
    expect(appStoreUrl("en")).toBe("https://apps.apple.com/ar/app/pawpi/id6785949610?l=en-GB");
    expect(appStoreUrl("es")).toBe("https://apps.apple.com/ar/app/pawpi/id6785949610?l=es");
  });
});

describe("AppStoreBadge", () => {
  it.each([
    ["/", "Descárgalo en el App Store", "es"],
    ["/?lang=en", "Download on the App Store", "en"],
  ])("%s: localized label, store link and self-hosted artwork", (url, label, lang) => {
    renderBadge(url);
    const link = screen.getByRole("link", { name: label });
    expect(link).toHaveAttribute("href", appStoreUrl(lang));
    // Same tab, and a class that carries the visible keyboard focus ring.
    expect(link).not.toHaveAttribute("target");
    expect(link).toHaveClass("pp-focus");

    const img = screen.getByRole("img", { name: label });
    const src = img.getAttribute("src");
    expect(src).toBe(`/badges/app-store-${lang}.svg`);
    expect(existsSync(resolve(root, `public${src}`))).toBe(true);
  });

  it("never renders below Apple's 40px minimum height, and keeps the aspect ratio", () => {
    renderBadge("/", { height: 24 });
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("height", "40");
    expect(img).toHaveAttribute("width", "120");
    expect(img.style.width).toBe("auto");
  });

  // Apple's artwork must not be modified. If Apple ships new files, replace them and update the hashes.
  it.each([
    ["en", "a26fc5b38380272c92e9019a2eb8b45542a66814b3e2b203772db8904b9fb99f"],
    ["es", "f5c911a6fb1861e0ba1007be5aa84162e8bc13ab6eebf953723ea3b282817be9"],
  ])("the %s badge file is Apple's artwork, byte for byte", (lang, sha) => {
    const file = readFileSync(resolve(root, `public/badges/app-store-${lang}.svg`));
    expect(createHash("sha256").update(file).digest("hex")).toBe(sha);
  });
});

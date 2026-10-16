import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Privacy guard: public pages must not make third-party font/icon requests (a visitor's IP would reach
// Google / Font Awesome, which the Privacy Policy does not disclose). Fonts are self-hosted from
// public/fonts via @font-face in global.css. Add a vendor to Privacy Section 8 (EN + ES) BEFORE
// loosening this.
const root = resolve(__dirname, "../..");
const read = (p) => readFileSync(resolve(root, p), "utf8");
const THIRD_PARTY = /fonts\.googleapis\.com|fonts\.gstatic\.com|fontawesome\.com|use\.fontawesome|cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome/i;

describe("public pages load no third-party fonts or icon kits", () => {
  it.each(["src/app/root.tsx", "src/lib/legal/head.js", "src/app/global.css"])(
    "%s references no third-party font/icon host",
    (file) => {
      expect(read(file)).not.toMatch(THIRD_PARTY);
    },
  );

  it("self-hosts the brand fonts (files exist and global.css points at them)", () => {
    const css = read("src/app/global.css");
    for (const f of [
      "nunito-latin-wght-normal.woff2",
      "nunito-latin-ext-wght-normal.woff2",
      "jetbrains-mono-latin-400-normal.woff2",
      "jetbrains-mono-latin-500-normal.woff2",
    ]) {
      expect(css).toContain(`/fonts/${f}`);
      expect(existsSync(resolve(root, "public/fonts", f))).toBe(true);
    }
    expect(css).toMatch(/font-family:\s*'Nunito'/);
    expect(css).toMatch(/font-family:\s*'JetBrains Mono'/);
  });
});

// Distances are shown in kilometres everywhere (owner decision 2026-11-27).
import fs from "fs";
import path from "path";
import { formatKmFromMetres, metresToKm } from "./distance";
import { formatDistance, formatPace } from "./healthKitIntegration";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";

test("metres become kilometres with two decimals", () => {
  expect(metresToKm(1250)).toBe(1.25);
  expect(metresToKm("3218.68")).toBe(3.22);
  expect(metresToKm(null)).toBeNull();
});

test("shown in km, with the viewer's decimal separator", () => {
  expect(formatKmFromMetres(1250)).toBe("1,25 km"); // Spanish is the app's default
  expect(formatKmFromMetres(null)).toBeNull();
  expect(formatDistance(2)).toBe("2.00 km");
  expect(formatPace("12:30")).toBe("12:30 min/km");
});

test("no text or screen speaks of miles", () => {
  expect(JSON.stringify(en)).not.toMatch(/\(miles\)/);
  expect(JSON.stringify(es)).not.toMatch(/millas/i);
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.(js|jsx)$/.test(entry.name) && !/\.test\./.test(entry.name) && !file.includes("dogBreeds")) {
        if (/"miles"|'miles'|\} mi\b|metresToMiles|Distance \(miles\)/.test(fs.readFileSync(file, "utf8"))) offenders.push(file);
      }
    }
  };
  walk(path.join(__dirname, ".."));
  expect(offenders).toEqual([]);
});

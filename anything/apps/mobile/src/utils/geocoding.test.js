// Unit tests for the geocode/reverse-geocode wrappers (ticket N1). expo-location is
// fully mocked — no real network in CI — and every case proves the wrapper resolves
// to a plain value or null rather than throwing, so callers never need their own
// try/catch and a permission-denied / offline / no-match result degrades cleanly.

const mockReverseGeocodeAsync = jest.fn();
const mockGeocodeAsync = jest.fn();
jest.mock("expo-location", () => ({
  reverseGeocodeAsync: (...a) => mockReverseGeocodeAsync(...a),
  geocodeAsync: (...a) => mockGeocodeAsync(...a),
}));

import {
  formatReverseGeocodeResult,
  reverseGeocode,
  forwardGeocode,
} from "./geocoding";

beforeEach(() => {
  mockReverseGeocodeAsync.mockReset();
  mockGeocodeAsync.mockReset();
});

describe("formatReverseGeocodeResult", () => {
  it("joins street + city into a short address", () => {
    expect(
      formatReverseGeocodeResult({
        streetNumber: "221B",
        street: "Baker Street",
        city: "London",
      }),
    ).toBe("221B Baker Street, London");
  });

  it("falls back to name when street is missing", () => {
    expect(
      formatReverseGeocodeResult({ name: "Central Park", city: "New York" }),
    ).toBe("Central Park, New York");
  });

  it("falls back to subregion/region when city is missing", () => {
    expect(
      formatReverseGeocodeResult({ street: "Main St", region: "CA" }),
    ).toBe("Main St, CA");
  });

  it("returns null for an empty/null result", () => {
    expect(formatReverseGeocodeResult(null)).toBeNull();
    expect(formatReverseGeocodeResult({})).toBeNull();
  });
});

describe("reverseGeocode", () => {
  it("resolves to a formatted address on success", async () => {
    mockReverseGeocodeAsync.mockResolvedValue([
      { street: "Main St", city: "Springfield" },
    ]);
    const addr = await reverseGeocode(40.7, -74);
    expect(addr).toBe("Main St, Springfield");
    expect(mockReverseGeocodeAsync).toHaveBeenCalledWith({
      latitude: 40.7,
      longitude: -74,
    });
  });

  it("resolves to null for invalid coordinates without calling expo-location", async () => {
    const addr = await reverseGeocode(NaN, undefined);
    expect(addr).toBeNull();
    expect(mockReverseGeocodeAsync).not.toHaveBeenCalled();
  });

  it("resolves to null when no results come back", async () => {
    mockReverseGeocodeAsync.mockResolvedValue([]);
    expect(await reverseGeocode(40.7, -74)).toBeNull();
  });

  it("resolves to null (never throws) when expo-location rejects — e.g. permission denied", async () => {
    mockReverseGeocodeAsync.mockRejectedValue(new Error("permission denied"));
    await expect(reverseGeocode(40.7, -74)).resolves.toBeNull();
  });
});

describe("forwardGeocode", () => {
  it("resolves to { lat, lng } on a match", async () => {
    mockGeocodeAsync.mockResolvedValue([
      { latitude: 51.5, longitude: -0.12 },
    ]);
    expect(await forwardGeocode("10 Downing Street")).toEqual({
      lat: 51.5,
      lng: -0.12,
    });
    expect(mockGeocodeAsync).toHaveBeenCalledWith("10 Downing Street");
  });

  it("resolves to null for blank input without calling expo-location", async () => {
    expect(await forwardGeocode("   ")).toBeNull();
    expect(await forwardGeocode("")).toBeNull();
    expect(mockGeocodeAsync).not.toHaveBeenCalled();
  });

  it("resolves to null when nothing matches", async () => {
    mockGeocodeAsync.mockResolvedValue([]);
    expect(await forwardGeocode("nowhere at all")).toBeNull();
  });

  it("resolves to null (never throws) when expo-location rejects", async () => {
    mockGeocodeAsync.mockRejectedValue(new Error("network error"));
    await expect(forwardGeocode("somewhere")).resolves.toBeNull();
  });
});

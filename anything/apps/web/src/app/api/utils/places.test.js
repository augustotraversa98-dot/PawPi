import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { placesConfigured, searchPlaces, placeDetails } from "./places";

// The Google Places proxy: degrades cleanly when the key is unset (never throws) and normalizes
// Google's response to PawPi's shape. fetch is injected so no network/global mock is needed.

const ORIGINAL = process.env.GOOGLE_PLACES_API_KEY;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
  else process.env.GOOGLE_PLACES_API_KEY = ORIGINAL;
});

describe("placesConfigured", () => {
  it("false when the key is unset, true when set", () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    expect(placesConfigured()).toBe(false);
    process.env.GOOGLE_PLACES_API_KEY = "k";
    expect(placesConfigured()).toBe(true);
  });
});

describe("searchPlaces", () => {
  it("returns a clean not-configured signal when the key is unset", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    const r = await searchPlaces({ lat: 1, lng: 2, category: "park" }, async () => {
      throw new Error("should not fetch");
    });
    expect(r).toEqual({ configured: false, places: [] });
  });

  it("normalizes Google's nearby results when configured", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "k";
    const fetchImpl = async () => ({
      json: async () => ({
        status: "OK",
        results: [
          {
            place_id: "p1",
            name: "Dog Park",
            geometry: { location: { lat: 40.7, lng: -74 } },
            vicinity: "Main St",
            rating: 4.5,
            opening_hours: { open_now: true },
          },
        ],
      }),
    });
    const r = await searchPlaces({ lat: 40.7, lng: -74, category: "park" }, fetchImpl);
    expect(r.configured).toBe(true);
    expect(r.places[0]).toMatchObject({
      place_id: "p1",
      name: "Dog Park",
      lat: 40.7,
      lng: -74,
      address: "Main St",
      rating: 4.5,
      open_now: true,
      category: "park",
    });
  });

  it("returns empty (not a throw) on an upstream error status", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "k";
    const fetchImpl = async () => ({ json: async () => ({ status: "REQUEST_DENIED" }) });
    const r = await searchPlaces({ lat: 1, lng: 2, category: "cafe" }, fetchImpl);
    expect(r).toMatchObject({ configured: true, places: [] });
  });

  it("returns empty when the network call throws", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "k";
    const r = await searchPlaces({ lat: 1, lng: 2, category: "cafe" }, async () => {
      throw new Error("network");
    });
    expect(r.places).toEqual([]);
  });
});

describe("placeDetails", () => {
  it("not-configured signal when unset", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    expect(await placeDetails("p1", async () => ({}))).toEqual({
      configured: false,
      place: null,
    });
  });

  it("normalizes detail fields", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "k";
    const fetchImpl = async () => ({
      json: async () => ({
        result: {
          place_id: "p1",
          name: "Paws Cafe",
          geometry: { location: { lat: 1, lng: 2 } },
          formatted_address: "1 St",
          formatted_phone_number: "555",
          website: "https://x",
          opening_hours: { weekday_text: ["Mon 9-5"] },
          url: "https://maps",
        },
      }),
    });
    const r = await placeDetails("p1", fetchImpl);
    expect(r.place).toMatchObject({
      name: "Paws Cafe",
      address: "1 St",
      phone: "555",
      website: "https://x",
      hours: ["Mon 9-5"],
      google_maps_url: "https://maps",
    });
  });
});

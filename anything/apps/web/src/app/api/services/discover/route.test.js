import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/services/discover — the UNIFIED services discovery API. Merges PawPi providers (published
// projection, capability-filtered) and pet-friendly PLACES (0075 catalog) into one normalized, typed
// { items: [...] } result. auth() and `sql` are mocked at the module boundary so the real query
// builder + merge/sort logic run against canned rows. num/distanceKm (placesQuery) +
// resolveDiscoveryCategory (discoveryCategories) are pure and run for real.
//
// Query call order in the handler is deterministic: providers first (when included), then places.

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const req = (q = "") => new Request(`http://localhost/api/services/discover?${q}`);

// The joined SQL text of whichever call targeted a given source table.
const callText = (i) => (sql.mock.calls[i]?.[0] ?? []).join(" ");
const callValues = (i) => sql.mock.calls[i]?.slice(1) ?? [];
const findCall = (needle) =>
  sql.mock.calls.find((c) => (c?.[0] ?? []).join(" ").includes(needle));
const findValues = (needle) => findCall(needle)?.slice(1) ?? [];
const allText = () =>
  sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" ");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/services/discover", () => {
  it("401 when unauthenticated, no query", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(req("q=vet"));
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it("'all' (default) merges BOTH types with the normalized typed shape", async () => {
    auth.mockResolvedValue(SESSION);
    // call 0 = providers, call 1 = places
    sql.mockResolvedValueOnce([
      {
        id: 7,
        slug: "happy-paws",
        name: "Happy Paws",
        avg_rating: "4.5",
        review_count: 10,
        capabilities: ["groomer", "vet"],
        lat: -34.6,
        lng: -58.4,
        address: "Av. Vet 100",
        hours_json: { wed: "09:00-17:00" },
      },
    ]);
    sql.mockResolvedValueOnce([
      {
        id: "curated-cafe-x",
        name: "Cafe X",
        category: "cafe",
        neighborhood: "Palermo",
        address: "Calle 1",
        lat: -34.58,
        lng: -58.42,
        avg_rating: "4.0",
        review_count: 3,
      },
    ]);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(sql).toHaveBeenCalledTimes(2);

    const provider = items.find((i) => i.type === "provider");
    const place = items.find((i) => i.type === "place");

    // Provider row: slug + capabilities present; category/neighborhood null.
    expect(provider).toEqual({
      type: "provider",
      id: 7,
      slug: "happy-paws",
      name: "Happy Paws",
      capabilities: ["groomer", "vet"],
      category: null,
      lat: -34.6,
      lng: -58.4,
      address: "Av. Vet 100",
      neighborhood: null,
      hours_json: { wed: "09:00-17:00" },
      avg_rating: "4.5",
      review_count: 10,
    });

    // Place row: category + neighborhood present; slug null, capabilities null.
    expect(place).toEqual({
      type: "place",
      id: "curated-cafe-x",
      slug: null,
      name: "Cafe X",
      capabilities: null,
      category: "cafe",
      lat: -34.58,
      lng: -58.42,
      address: "Calle 1",
      neighborhood: "Palermo",
      hours_json: null,
      avg_rating: "4.0",
      review_count: 3,
    });

    // No geo → no distance_km on either.
    expect(provider.distance_km).toBeUndefined();
    expect(place.distance_km).toBeUndefined();
  });

  it("q → bound ILIKE name search across BOTH sources", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);
    sql.mockResolvedValueOnce([]);

    await GET(req("q=happy"));

    const providerCall = findCall("FROM providers");
    const placeCall = findCall("FROM places");
    expect(providerCall[0].join(" ")).toContain("p.name ILIKE");
    expect(placeCall[0].join(" ")).toContain("pl.name ILIKE");
    expect(findValues("FROM providers")).toContain("%happy%");
    expect(findValues("FROM places")).toContain("%happy%");
  });

  it("provider category (grooming) → providers ONLY, filtered by capability 'groomer'", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 1, name: "G", capabilities: ["groomer"] }]);

    const res = await GET(req("category=grooming"));
    const { items } = await res.json();

    expect(sql).toHaveBeenCalledTimes(1); // no places query
    expect(callText(0)).toContain("FROM providers");
    expect(callText(0)).toContain("pc.capability =");
    expect(callValues(0)).toContain("groomer"); // mapped name→capability, bound
    expect(items.every((i) => i.type === "provider")).toBe(true);
  });

  it("place category (cafe) → places ONLY, filtered by places.category", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([
      { id: "p1", name: "Cafe", category: "cafe" },
    ]);

    const res = await GET(req("category=cafe"));
    const { items } = await res.json();

    expect(sql).toHaveBeenCalledTimes(1); // no providers query
    expect(callText(0)).toContain("FROM places");
    expect(callText(0)).toContain("pl.category =");
    expect(callValues(0)).toContain("cafe");
    expect(items.every((i) => i.type === "place")).toBe(true);
  });

  it("unknown category → neither source, empty items, no SQL", async () => {
    auth.mockResolvedValue(SESSION);
    const res = await GET(req("category=spaceship"));
    expect(res.status).toBe(200);
    expect((await res.json()).items).toEqual([]);
    expect(sql).not.toHaveBeenCalled();
  });

  it("neighborhood filters PLACES but keeps providers (city-wide)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 1, name: "CityVet", capabilities: [] }]); // providers
    sql.mockResolvedValueOnce([
      { id: "pl1", name: "Local Cafe", category: "cafe", neighborhood: "Palermo" },
    ]); // places

    const res = await GET(req("neighborhood=Palermo"));
    const { items } = await res.json();

    // Places query binds + filters neighborhood…
    expect(findCall("FROM places")[0].join(" ")).toContain("pl.neighborhood =");
    expect(findValues("FROM places")).toContain("Palermo");
    // …providers query never mentions neighborhood (city-wide services).
    expect(findCall("FROM providers")[0].join(" ")).not.toContain("neighborhood");
    // Both types survive: the provider is not filtered out by neighborhood.
    expect(items.some((i) => i.type === "provider")).toBe(true);
    expect(items.some((i) => i.type === "place")).toBe(true);
  });

  it("geo → distance_km attached and MERGED list sorts nearest-first across both types", async () => {
    auth.mockResolvedValue(SESSION);
    // Provider is FAR; place is NEAR the query origin → place must sort first.
    sql.mockResolvedValueOnce([
      { id: 1, name: "Far Vet", capabilities: [], lat: -34.9, lng: -58.9 },
    ]);
    sql.mockResolvedValueOnce([
      { id: "near", name: "Near Cafe", category: "cafe", lat: -34.61, lng: -58.41 },
    ]);

    const res = await GET(req("lat=-34.6&lng=-58.4"));
    const { items } = await res.json();

    expect(items.map((i) => i.type)).toEqual(["place", "provider"]); // nearest first
    expect(items[0].distance_km).toBeLessThan(items[1].distance_km);
    expect(typeof items[0].distance_km).toBe("number");
  });

  it("geo → coord-less items sort last with distance_km null", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([
      { id: 1, name: "Located Vet", capabilities: [], lat: -34.61, lng: -58.41 },
    ]);
    sql.mockResolvedValueOnce([
      { id: "nc", name: "NoCoords Cafe", category: "cafe", lat: null, lng: null },
    ]);

    const res = await GET(req("lat=-34.6&lng=-58.4"));
    const { items } = await res.json();

    expect(items.map((i) => i.type)).toEqual(["provider", "place"]);
    expect(items.at(-1).distance_km).toBeNull();
  });

  it("?radius with geo adds a bounding-box coordinate filter to both sources", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);
    sql.mockResolvedValueOnce([]);

    await GET(req("lat=-34.6&lng=-58.4&radius=5"));

    expect(findCall("FROM providers")[0].join(" ")).toContain("loc.lat BETWEEN");
    expect(findCall("FROM places")[0].join(" ")).toContain("pl.lat BETWEEN");
  });

  it("ratings populated per type (provider_reviews vs place_reviews overall)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);
    sql.mockResolvedValueOnce([]);

    await GET(req());

    const providerText = findCall("FROM providers")[0].join(" ");
    const placeText = findCall("FROM places")[0].join(" ");
    // Provider aggregate over provider_reviews.rating.
    expect(providerText).toContain("provider_reviews");
    expect(providerText).toContain("AVG(r.rating)");
    expect(providerText).toContain("AS avg_rating");
    expect(providerText).toContain("AS review_count");
    // Place aggregate over place_reviews.overall_rating (non-deleted only).
    expect(placeText).toContain("place_reviews");
    expect(placeText).toContain("AVG(r.overall_rating)");
    expect(placeText).toContain("r.deleted_at IS NULL");
    expect(placeText).toContain("AS avg_rating");
    expect(placeText).toContain("AS review_count");
  });

  it("never touches care_access_grants (public browse, no consent data)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);
    sql.mockResolvedValueOnce([]);
    await GET(req());
    expect(allText()).not.toContain("care_access");
  });
});

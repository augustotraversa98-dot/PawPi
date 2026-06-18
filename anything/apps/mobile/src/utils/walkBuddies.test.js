import {
  VISIBILITY,
  visibilityForToggle,
  isPublicVisibility,
  isValidCoord,
  boundingBox,
  isWithinBox,
  discoverQuery,
} from "./walkBuddies";

describe("walkBuddies — visibility mapping", () => {
  it("maps the public/private toggle onto stored visibility values", () => {
    expect(visibilityForToggle(true)).toBe(VISIBILITY.PUBLIC);
    expect(visibilityForToggle(false)).toBe(VISIBILITY.PRIVATE);
    expect(VISIBILITY.PUBLIC).toBe("nearby_pets");
    expect(VISIBILITY.PRIVATE).toBe("private");
  });

  it("identifies public visibility", () => {
    expect(isPublicVisibility("nearby_pets")).toBe(true);
    expect(isPublicVisibility("private")).toBe(false);
    expect(isPublicVisibility("friends_only")).toBe(false);
  });
});

describe("walkBuddies — coords", () => {
  it("validates lat/lng range", () => {
    expect(isValidCoord(40.7, -74)).toBe(true);
    expect(isValidCoord(91, 0)).toBe(false);
    expect(isValidCoord(0, 181)).toBe(false);
    expect(isValidCoord(NaN, 0)).toBe(false);
    expect(isValidCoord(undefined, undefined)).toBe(false);
  });

  it("computes a bounding box that contains the center", () => {
    const box = boundingBox(40.7, -74, 10);
    expect(box.latMin).toBeLessThan(40.7);
    expect(box.latMax).toBeGreaterThan(40.7);
    expect(box.lngMin).toBeLessThan(-74);
    expect(box.lngMax).toBeGreaterThan(-74);
    expect(isWithinBox({ lat: 40.7, lng: -74 }, box)).toBe(true);
  });

  it("flags a far-away walk as outside the box", () => {
    const box = boundingBox(40.7, -74, 5);
    expect(isWithinBox({ lat: 51.5, lng: 0 }, box)).toBe(false);
    expect(isWithinBox({ lat: null, lng: null }, box)).toBe(false);
  });
});

describe("walkBuddies — discoverQuery", () => {
  it("always requests public walks", () => {
    expect(discoverQuery()).toContain("visibility=nearby_pets");
  });

  it("adds the bounding-box params when a location is provided", () => {
    const qs = discoverQuery({ location: { lat: 40.7, lng: -74 }, radiusKm: 8 });
    expect(qs).toContain("lat=40.7");
    expect(qs).toContain("lng=-74");
    expect(qs).toContain("radiusKm=8");
  });

  it("omits coords when the location is invalid", () => {
    const qs = discoverQuery({ location: { lat: 999, lng: 0 } });
    expect(qs).not.toContain("lat=");
  });
});

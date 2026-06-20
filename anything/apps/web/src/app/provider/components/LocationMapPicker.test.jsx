import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import LocationMapPicker, { mapsConfigured } from "./LocationMapPicker";

// In CI/jsdom NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY is unset, so the picker must degrade cleanly:
// report not-configured and render nothing (the location form keeps its manual lat/lng inputs).
// The interactive Google map itself is device/manual-tested, not CI-rendered.
describe("LocationMapPicker (degrade path)", () => {
  it("reports not configured when the browser maps key is unset", () => {
    expect(mapsConfigured()).toBe(false);
  });

  it("renders nothing (no crash) when the key is unset", () => {
    const { container } = render(
      <LocationMapPicker lat={40.7128} lng={-74.006} onPick={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

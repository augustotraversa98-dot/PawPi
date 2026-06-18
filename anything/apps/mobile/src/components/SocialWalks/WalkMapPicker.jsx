import React from "react";
import MapLocationPicker from "@/components/Map/MapLocationPicker";

/**
 * WalkMapPicker — meeting-pin picker for a social walk (ticket 2.43).
 *
 * As of ticket 2.68 this is a THIN WRAPPER over the shared <MapLocationPicker>
 * (Apple Maps via PROVIDER_DEFAULT). It keeps the original `coord` / `onPick`
 * API so the create-walk, lost & found, and transport call sites — and their
 * tests — are unchanged while every picker now reuses the one shared component.
 */
export default function WalkMapPicker({ coord, onPick, testID = "walk-map-picker" }) {
  return (
    <MapLocationPicker
      testID={testID}
      value={coord}
      onChange={onPick}
    />
  );
}

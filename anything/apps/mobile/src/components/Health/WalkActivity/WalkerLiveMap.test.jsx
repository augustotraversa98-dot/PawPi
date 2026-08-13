// WalkerLiveMap (ticket 2.102) — the walker's own live route map while a walk is active:
//   - valid GPS points → the real map (MapLocationView) with the recorded polyline;
//   - no points yet → the "waiting for GPS" note;
//   - foreground location denied → the graceful "time still tracks, no map" note (no crash).
// MapLocationView is mocked to a Text showing its polyline point count (same convention as
// transport-track.test.jsx), so no native maps run in jest.

import React from "react";
import { render } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("@/components/Map/MapLocationView", () => {
  const { Text } = require("react-native");
  return ({ polyline, points }) => (
    <Text testID="map-view">{`p:${polyline?.length || 0};m:${points?.length || 0}`}</Text>
  );
});

import WalkerLiveMap from "./WalkerLiveMap";

test("valid points → renders the real map with the recorded route", () => {
  const { getByTestId, queryByTestId } = render(
    <WalkerLiveMap
      points={[
        { lat: 1, lng: 1 },
        { lat: 1.001, lng: 1.001 },
        { lat: 1.002, lng: 1.002 },
      ]}
    />,
  );
  expect(getByTestId("walker-live-map")).toBeTruthy();
  // The whole track feeds the polyline; only start + latest are markers.
  expect(getByTestId("map-view").props.children).toBe("p:3;m:2");
  expect(queryByTestId("walker-map-waiting")).toBeNull();
});

test("no points yet → waiting note (no fake path)", () => {
  const { getByTestId, queryByTestId } = render(<WalkerLiveMap points={[]} />);
  expect(getByTestId("walker-map-waiting")).toBeTruthy();
  expect(queryByTestId("walker-live-map")).toBeNull();
});

test("invalid coords are filtered out → waiting note", () => {
  const { getByTestId } = render(
    <WalkerLiveMap points={[{ lat: null, lng: 2 }, { lat: 999, lng: 0 }]} />,
  );
  expect(getByTestId("walker-map-waiting")).toBeTruthy();
});

test("permission denied → graceful no-map note, even with points", () => {
  const { getByTestId, queryByTestId } = render(
    <WalkerLiveMap points={[{ lat: 1, lng: 1 }]} permissionDenied />,
  );
  expect(getByTestId("walker-map-denied")).toBeTruthy();
  expect(queryByTestId("walker-live-map")).toBeNull();
});

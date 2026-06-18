// Shared Apple-Maps location components (ticket 2.68):
//   - MapLocationPicker fires onChange on map press, marker drag, and "My location";
//     renders an existing pin readout.
//   - LocationField opens the picker in a modal and writes the value back on Done.
//   - MapLocationView renders markers + a polyline from real points, and an empty
//     state when there are none.
// react-native-maps + expo-location are mocked (no native maps in jest).

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => {
  const { View } = require("react-native");
  return { SafeAreaView: ({ children }) => <View>{children}</View> };
});
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
}));

const mockReq = jest.fn();
const mockPos = jest.fn();
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: (...a) => mockReq(...a),
  getCurrentPositionAsync: (...a) => mockPos(...a),
}));

// Mock the native map primitives as touchables so handlers can be fired:
//   MapView.onPress  ← fireEvent.press(map, { nativeEvent: { coordinate }})
//   Marker.onDragEnd ← fireEvent.press(marker, { nativeEvent: { coordinate }})
jest.mock("react-native-maps", () => {
  const React = require("react");
  const { View, TouchableOpacity } = require("react-native");
  const MapView = ({ children, onPress, testID }) =>
    React.createElement(TouchableOpacity, { testID, onPress }, children);
  const Marker = ({ children, onDragEnd, testID }) =>
    React.createElement(TouchableOpacity, { testID, onPress: onDragEnd }, children);
  const Polyline = ({ testID }) => React.createElement(View, { testID });
  return {
    __esModule: true,
    default: MapView,
    MapView,
    Marker,
    Polyline,
    PROVIDER_DEFAULT: "default",
  };
});

import MapLocationPicker from "./MapLocationPicker";
import MapLocationView from "./MapLocationView";
import LocationField from "./LocationField";

const COORD = { latitude: 40.7, longitude: -74 };

beforeEach(() => {
  mockReq.mockReset();
  mockPos.mockReset();
});

describe("MapLocationPicker", () => {
  it("fires onChange when the map is tapped", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <MapLocationPicker value={null} onChange={onChange} />,
    );
    fireEvent.press(getByTestId("map-location-picker-map"), {
      nativeEvent: { coordinate: COORD },
    });
    expect(onChange).toHaveBeenCalledWith({ lat: 40.7, lng: -74 });
  });

  it("renders a draggable marker for an existing pin and fires onChange on drag", () => {
    const onChange = jest.fn();
    const { getByTestId, getByText } = render(
      <MapLocationPicker value={{ lat: 40.7, lng: -74 }} onChange={onChange} />,
    );
    // Readout shows the pinned coordinate.
    expect(getByText(/40\.7000/)).toBeTruthy();
    fireEvent.press(getByTestId("map-location-picker-marker"), {
      nativeEvent: { coordinate: { latitude: 41.1, longitude: -73.5 } },
    });
    expect(onChange).toHaveBeenCalledWith({ lat: 41.1, lng: -73.5 });
  });

  it("centers and fires onChange from 'My location' when permission is granted", async () => {
    mockReq.mockResolvedValue({ status: "granted" });
    mockPos.mockResolvedValue({ coords: { latitude: 51.5, longitude: -0.12 } });
    const onChange = jest.fn();
    const { getByTestId } = render(
      <MapLocationPicker value={null} onChange={onChange} />,
    );
    fireEvent.press(getByTestId("map-location-picker-locate"));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ lat: 51.5, lng: -0.12 }),
    );
  });

  it("does not fire onChange when location permission is denied", async () => {
    mockReq.mockResolvedValue({ status: "denied" });
    const onChange = jest.fn();
    const { getByTestId } = render(
      <MapLocationPicker value={null} onChange={onChange} />,
    );
    fireEvent.press(getByTestId("map-location-picker-locate"));
    await waitFor(() => expect(mockReq).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalled();
    expect(mockPos).not.toHaveBeenCalled();
  });
});

describe("LocationField", () => {
  it("opens the picker and writes the chosen pin back on Done", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <LocationField value={null} onChange={onChange} label="Where" />,
    );
    fireEvent.press(getByTestId("location-field-open"));
    fireEvent.press(getByTestId("location-field-picker-map"), {
      nativeEvent: { coordinate: COORD },
    });
    fireEvent.press(getByTestId("location-field-done"));
    expect(onChange).toHaveBeenCalledWith({
      lat: 40.7,
      lng: -74,
      address: null,
    });
  });
});

describe("MapLocationView", () => {
  it("renders markers and a polyline from real points", () => {
    const { getByTestId } = render(
      <MapLocationView
        points={[
          { lat: 40.7, lng: -74 },
          { lat: 40.8, lng: -73.9 },
        ]}
        polyline={[
          { lat: 40.7, lng: -74 },
          { lat: 40.8, lng: -73.9 },
        ]}
      />,
    );
    expect(getByTestId("map-location-view-marker-0")).toBeTruthy();
    expect(getByTestId("map-location-view-marker-1")).toBeTruthy();
    expect(getByTestId("map-location-view-polyline")).toBeTruthy();
  });

  it("renders an empty state when there are no valid points", () => {
    const { getByTestId, queryByTestId } = render(
      <MapLocationView points={null} />,
    );
    expect(getByTestId("map-location-view-empty")).toBeTruthy();
    expect(queryByTestId("map-location-view-map")).toBeNull();
  });
});

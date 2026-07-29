// Shared Apple-Maps location components (ticket 2.68):
//   - MapLocationPicker fires onChange on map press, marker drag, and "My location";
//     renders an existing pin readout.
//   - LocationField opens the picker in a modal and writes the value back on Done.
//   - MapLocationView renders markers + a polyline from real points, and an empty
//     state when there are none.
// Address autofill (ticket N1): MapLocationPicker also reverse-geocodes a settled
// pin into the address field, and forward-geocodes a typed address into a pin.
// react-native-maps + expo-location are mocked (no native maps / no real network
// in jest); useDebouncedValue is mocked to identity, same convention as the other
// debounced-search screens (see create-walk.test.jsx / search.test.jsx).

import React, { useState } from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => {
  const { View } = require("react-native");
  return { SafeAreaView: ({ children }) => <View>{children}</View> };
});
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
}));
jest.mock("@/hooks/useSearch", () => ({ useDebouncedValue: (v) => v }));

const mockReq = jest.fn();
const mockPos = jest.fn();
const mockReverseGeocode = jest.fn();
const mockGeocode = jest.fn();
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: (...a) => mockReq(...a),
  getCurrentPositionAsync: (...a) => mockPos(...a),
  reverseGeocodeAsync: (...a) => mockReverseGeocode(...a),
  geocodeAsync: (...a) => mockGeocode(...a),
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
  mockReverseGeocode.mockReset();
  mockGeocode.mockReset();
});

// A minimal controlled wrapper — real consumers own `value` in their own state and
// pass it back through onChange, which is what makes a pin "settle" after a drop.
function ControlledPicker(props) {
  const [value, setValue] = useState(props.initialValue ?? null);
  const [address, setAddress] = useState(props.initialAddress ?? "");
  return (
    <MapLocationPicker
      {...props}
      value={value}
      onChange={(next) => {
        setValue(next);
        props.onChange?.(next);
      }}
      address={address}
      onAddressChange={(text) => {
        setAddress(text);
        props.onAddressChange?.(text);
      }}
    />
  );
}

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

describe("MapLocationPicker address autofill (ticket N1)", () => {
  it("reverse-geocodes a settled pin and autofills the address field", async () => {
    mockReverseGeocode.mockResolvedValue([
      { street: "Main St", city: "Springfield" },
    ]);
    const { getByTestId } = render(
      <ControlledPicker showAddress testID="picker" />,
    );
    fireEvent.press(getByTestId("picker-map"), {
      nativeEvent: { coordinate: COORD },
    });
    await waitFor(() =>
      expect(getByTestId("picker-address").props.value).toBe(
        "Main St, Springfield",
      ),
    );
    expect(mockReverseGeocode).toHaveBeenCalledWith({
      latitude: 40.7,
      longitude: -74,
    });
  });

  it("does NOT reverse-geocode a pin that was already there on mount (edit flow)", async () => {
    render(
      <ControlledPicker
        showAddress
        testID="picker"
        initialValue={{ lat: 40.7, lng: -74 }}
        initialAddress="123 Saved Ave"
      />,
    );
    // Give any stray microtask a turn — the pin didn't change, so nothing should fire.
    await act(async () => {});
    expect(mockReverseGeocode).not.toHaveBeenCalled();
  });

  it("degrades cleanly when reverse geocoding returns nothing — coordinates keep showing", async () => {
    mockReverseGeocode.mockResolvedValue([]);
    const { getByTestId, getByText } = render(
      <ControlledPicker showAddress testID="picker" />,
    );
    fireEvent.press(getByTestId("picker-map"), {
      nativeEvent: { coordinate: COORD },
    });
    await waitFor(() => expect(mockReverseGeocode).toHaveBeenCalled());
    expect(getByText(/40\.7000/)).toBeTruthy();
    expect(getByTestId("picker-address").props.value).toBe("");
  });

  it("forward-geocodes a typed address on submit and moves the pin", async () => {
    mockGeocode.mockResolvedValue([{ latitude: 51.5, longitude: -0.12 }]);
    const onChange = jest.fn();
    const { getByTestId } = render(
      <ControlledPicker showAddress testID="picker" onChange={onChange} />,
    );
    fireEvent.changeText(getByTestId("picker-address"), "10 Downing Street");
    fireEvent(getByTestId("picker-address"), "submitEditing");
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ lat: 51.5, lng: -0.12 }),
    );
    expect(mockGeocode).toHaveBeenCalledWith("10 Downing Street");
    expect(getByTestId("picker-marker")).toBeTruthy();
  });

  it("shows a 'couldn't find that address' fallback when forward geocoding misses — never crashes, never silently no-ops", async () => {
    mockGeocode.mockResolvedValue([]);
    const onChange = jest.fn();
    const { getByTestId } = render(
      <ControlledPicker showAddress testID="picker" onChange={onChange} />,
    );
    fireEvent.changeText(getByTestId("picker-address"), "nowhere at all");
    fireEvent(getByTestId("picker-address"), "blur");
    await waitFor(() =>
      expect(getByTestId("picker-address-error")).toBeTruthy(),
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears the not-found fallback as soon as the address text changes again", async () => {
    mockGeocode.mockResolvedValue([]);
    const { getByTestId, queryByTestId } = render(
      <ControlledPicker showAddress testID="picker" />,
    );
    fireEvent.changeText(getByTestId("picker-address"), "nowhere at all");
    fireEvent(getByTestId("picker-address"), "blur");
    await waitFor(() =>
      expect(getByTestId("picker-address-error")).toBeTruthy(),
    );
    fireEvent.changeText(getByTestId("picker-address"), "nowhere at all!");
    expect(queryByTestId("picker-address-error")).toBeNull();
  });

  it("the manual lat/lng path is untouched when showAddress is off", () => {
    const onChange = jest.fn();
    const { queryByTestId, getByTestId } = render(
      <MapLocationPicker value={null} onChange={onChange} testID="picker" />,
    );
    expect(queryByTestId("picker-address")).toBeNull();
    fireEvent.press(getByTestId("picker-map"), {
      nativeEvent: { coordinate: COORD },
    });
    expect(onChange).toHaveBeenCalledWith({ lat: 40.7, lng: -74 });
    expect(mockReverseGeocode).not.toHaveBeenCalled();
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

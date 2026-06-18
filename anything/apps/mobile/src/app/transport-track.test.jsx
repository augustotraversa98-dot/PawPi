// Transport live-GPS screen (ticket 2.70):
//   - owner view renders pickup/dropoff/driver markers + the travelled polyline from real pings;
//   - shows the waiting state when there are no pings yet;
//   - driver mode posts a ping (permission → getCurrentPosition → POST) only while en_route, and
//     shows the not-en_route notice otherwise.
// Map (2.68 MapLocationView), expo-location, router, and the data hooks are mocked.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

let mockParams;
let mockTrack;
let mockPost;

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k }) }));
jest.mock("@/components/Map/MapLocationView", () => {
  const { Text } = require("react-native");
  return ({ points, polyline }) => (
    <Text testID="map-view">{`m:${points?.length || 0};p:${polyline?.length || 0}`}</Text>
  );
});

const mockReq = jest.fn();
const mockPos = jest.fn();
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: (...a) => mockReq(...a),
  getCurrentPositionAsync: (...a) => mockPos(...a),
}));
jest.mock("@/hooks/useTransport", () => ({
  useTripTrack: () => mockTrack,
  usePostTripLocation: () => mockPost,
}));

import TransportTrackScreen from "./transport-track";

const TRIP = {
  status: "en_route",
  pickup_lat: 40.7,
  pickup_lng: -74,
  pickup_address: "Home",
  dropoff_lat: 40.8,
  dropoff_lng: -73.9,
  dropoff_address: "Vet",
};

beforeEach(() => {
  mockReq.mockReset();
  mockPos.mockReset();
  mockParams = { tripId: "7" };
  mockPost = { mutateAsync: jest.fn().mockResolvedValue({}) };
  mockTrack = { data: { trip: TRIP, locations: [] }, isLoading: false };
});

describe("owner track view", () => {
  it("renders markers + polyline from real pings", () => {
    mockTrack = {
      data: {
        trip: TRIP,
        locations: [
          { lat: 40.71, lng: -74.0, recorded_at: "2026-06-19T10:00:00Z" },
          { lat: 40.74, lng: -73.96, recorded_at: "2026-06-19T10:05:00Z" },
        ],
      },
      isLoading: false,
    };
    const { getByTestId } = render(<TransportTrackScreen />);
    // 3 markers (pickup, dropoff, latest driver) + 2 polyline points
    expect(getByTestId("map-view").props.children).toBe("m:3;p:2");
  });

  it("shows the waiting state when there are no pings", () => {
    const { getByTestId } = render(<TransportTrackScreen />);
    expect(getByTestId("track-waiting")).toBeTruthy();
  });
});

describe("driver share", () => {
  it("posts a ping after permission is granted while en_route", async () => {
    mockParams = { tripId: "7", mode: "driver", providerId: "100" };
    mockReq.mockResolvedValue({ status: "granted" });
    mockPos.mockResolvedValue({ coords: { latitude: 40.72, longitude: -74.01 } });
    const { getByTestId } = render(<TransportTrackScreen />);
    fireEvent.press(getByTestId("driver-share-toggle"));
    await waitFor(() =>
      expect(mockPost.mutateAsync).toHaveBeenCalledWith({
        providerId: "100",
        tripId: "7",
        lat: 40.72,
        lng: -74.01,
      }),
    );
  });

  it("does not post when permission is denied", async () => {
    mockParams = { tripId: "7", mode: "driver", providerId: "100" };
    mockReq.mockResolvedValue({ status: "denied" });
    const { getByTestId } = render(<TransportTrackScreen />);
    fireEvent.press(getByTestId("driver-share-toggle"));
    await waitFor(() => expect(mockReq).toHaveBeenCalled());
    expect(mockPost.mutateAsync).not.toHaveBeenCalled();
    expect(getByTestId("driver-denied")).toBeTruthy();
  });

  it("hides sharing controls and shows a notice when the trip is not en_route", () => {
    mockParams = { tripId: "7", mode: "driver", providerId: "100" };
    mockTrack = {
      data: { trip: { ...TRIP, status: "completed" }, locations: [] },
      isLoading: false,
    };
    const { getByTestId, queryByTestId } = render(<TransportTrackScreen />);
    expect(queryByTestId("driver-share-toggle")).toBeNull();
    expect(getByTestId("driver-not-enroute")).toBeTruthy();
  });
});

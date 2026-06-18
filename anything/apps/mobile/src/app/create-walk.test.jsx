// Render pins for the "create a buddy walk" screen (ticket 2.43):
//   - the map picker sets coords (mocked WalkMapPicker fires onPick);
//   - the public/private toggle flips visibility and reveals the invite picker;
//   - submitting a public walk POSTs the coords + visibility 'nearby_pets';
//   - submitting a private walk POSTs visibility 'private' + invited user ids.
// All native deps (maps, location, datetime pickers) + data hooks are mocked.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockMutate;

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// WalkMapPicker → a button that drops a fixed pin via onPick.
jest.mock("@/components/SocialWalks/WalkMapPicker", () => {
  const { Text, TouchableOpacity } = require("react-native");
  return ({ onPick }) => (
    <TouchableOpacity
      testID="mock-pick-pin"
      onPress={() => onPick({ lat: 40.7, lng: -74.0 })}
    >
      <Text>pick</Text>
    </TouchableOpacity>
  );
});

// DateField/TimeField → buttons that commit canonical values.
jest.mock("@/components/DateField", () => {
  const { Text, TouchableOpacity } = require("react-native");
  return ({ onChange, testID }) => (
    <TouchableOpacity testID={testID} onPress={() => onChange("2026-09-01")}>
      <Text>date</Text>
    </TouchableOpacity>
  );
});
jest.mock("@/components/TimeField", () => {
  const { Text, TouchableOpacity } = require("react-native");
  return ({ onChange, testID }) => (
    <TouchableOpacity testID={testID} onPress={() => onChange("09:30")}>
      <Text>time</Text>
    </TouchableOpacity>
  );
});

jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 1, name: "Rex" } }),
}));
jest.mock("@/hooks/useSocialWalks", () => ({
  useCreateSocialWalk: () => ({ mutate: mockMutate, isPending: false }),
}));
jest.mock("@/hooks/useSearch", () => ({
  useDebouncedValue: (v) => v,
  useSearch: () => ({
    data: { owners: [{ id: 8, username: "jane", full_name: "Jane" }] },
    isFetching: false,
  }),
}));

import CreateWalkPage from "./create-walk";

beforeEach(() => {
  mockMutate = jest.fn();
});

function fillCommon(api) {
  fireEvent.changeText(api.getByTestId("walk-name-input"), "Park loop");
  fireEvent.press(api.getByTestId("walk-date"));
  fireEvent.press(api.getByTestId("walk-time"));
}

test("public walk submits coords + visibility 'nearby_pets'", () => {
  const api = render(<CreateWalkPage />);
  fillCommon(api);
  fireEvent.press(api.getByTestId("mock-pick-pin")); // drop the pin
  fireEvent.press(api.getByTestId("create-walk-submit"));

  expect(mockMutate).toHaveBeenCalledTimes(1);
  const payload = mockMutate.mock.calls[0][0];
  expect(payload.visibility).toBe("nearby_pets");
  expect(payload.lat).toBe(40.7);
  expect(payload.lng).toBe(-74.0);
  expect(payload.petId).toBe(1);
  expect(payload.inviteUserIds).toEqual([]);
});

test("private walk submits visibility 'private' + invited ids", () => {
  const api = render(<CreateWalkPage />);
  fillCommon(api);
  fireEvent.press(api.getByTestId("toggle-private")); // switch to private
  fireEvent.press(api.getByTestId("invite-result-8")); // select Jane
  fireEvent.press(api.getByTestId("create-walk-submit"));

  expect(mockMutate).toHaveBeenCalledTimes(1);
  const payload = mockMutate.mock.calls[0][0];
  expect(payload.visibility).toBe("private");
  expect(payload.inviteUserIds).toEqual([8]);
});

test("public walk requires a dropped pin before it can submit", () => {
  const api = render(<CreateWalkPage />);
  fillCommon(api);
  // no pin dropped yet → submit is disabled (mutate not called)
  fireEvent.press(api.getByTestId("create-walk-submit"));
  expect(mockMutate).not.toHaveBeenCalled();
});

// Render pins for the owner's Data Access (care-access trust) screen:
//   - pending requests spell out what they ask for; approving them as asked goes through a confirmation that lists it
//     all, and a record request can be answered by choosing sections instead (the share sheet, for that vet);
//   - a request from a business with no booking for the dog (every invite by link) is never approved as asked: only
//     "Choose what to share" or "Deny", after a note to check the name;
//   - active grants show exactly which sections and until when, with Revoke (through a confirm Alert);
//   - an expired grant is shown as ended, never under "Who has access";
//   - both sections show their empty state with no grants;
//   - no active pet → a friendly message, no crash.
// The data/mutation hooks, router, and Alert are mocked — this exercises wiring.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Alert } from "react-native";

let mockGrants;
let mockCurrentPet;
let mockBookings;
const mockMutate = jest.fn();

jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => mockCurrentPet,
}));
jest.mock("@/hooks/useProviders", () => ({
  useMyBookings: () => mockBookings,
}));
jest.mock("@/hooks/useCareAccessGrants", () => ({
  useCareAccessGrants: () => mockGrants,
  useUpdateGrant: () => ({ mutate: mockMutate, isPending: false }),
}));

// The links block has its own tests (components/Health/VetShare/RecordLinks.test.jsx); here only where it appears.
const mockRefetchLinks = jest.fn();
jest.mock("@/hooks/useRecordLinks", () => ({ useRecordLinks: () => ({ refetch: mockRefetchLinks }) }));
jest.mock("@/components/Health/VetShare/RecordLinks", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ pet, onCreate }) => <Text testID="record-links">{`${pet.id}${onCreate ? ":create" : ""}`}</Text>,
  };
});
jest.mock("@/components/Health/VetShare/ShareWithVetSheet", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ provider }) => (
      <Text testID="vet-share-sheet">
        {provider
          ? `${provider.providerId}:${provider.name}${provider.checkName ? ":check-name" : ""}`
          : "any"}
      </Text>
    ),
  };
});

import DataAccessScreen from "./data-access";

beforeEach(() => {
  mockMutate.mockReset();
  mockCurrentPet = { data: { id: 7, name: "Rex" } };
  mockGrants = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
  // The requesting business of these tests (provider 5) has a booking for the dog unless a test says otherwise.
  mockBookings = booked({ pet_id: 7, provider_id: 5, booking_status: "confirmed" });
  // Auto-press the destructive (non-cancel) button so confirm dialogs resolve.
  jest.spyOn(Alert, "alert").mockImplementation((title, msg, buttons = []) => {
    const target = buttons.find((b) => b.style === "destructive") || buttons[0];
    target?.onPress?.();
  });
});

const booked = (...upcoming) => ({ data: { upcoming, past: [] }, refetch: jest.fn() });

afterEach(() => {
  jest.restoreAllMocks();
});

test("no active pet → friendly message, no crash", () => {
  mockCurrentPet = { data: null };
  const { getByText } = render(<DataAccessScreen />);
  expect(getByText("No pet selected")).toBeTruthy();
});

test("empty states for both sections when there are no grants", () => {
  const { getByText } = render(<DataAccessScreen />);
  expect(getByText("No pending requests.")).toBeTruthy();
  expect(getByText("No one has access yet.")).toBeTruthy();
});

const list = (...data) => ({ data, isLoading: false, isError: false, refetch: jest.fn() });
const request = (over) => ({
  id: 11,
  status: "pending",
  provider_id: 5,
  provider_name: "Happy Paws",
  pet_name: "Rex",
  scopes: ["medical_read", "medical_write", "vaccinations_write"],
  sections: null,
  ...over,
});

test("a pending record request spells out everything it asks for", () => {
  mockGrants = list(request());
  const { getByText, queryByText } = render(<DataAccessScreen />);

  expect(getByText("Happy Paws")).toBeTruthy();
  expect(getByText("wants access to Rex")).toBeTruthy();
  expect(getByText("Asked for:")).toBeTruthy();
  expect(getByText("Medical profile, emergency contact, insurance and medical notes")).toBeTruthy();
  expect(getByText("All vet notes, yours and the ones vets added")).toBeTruthy();
  expect(getByText("A private file of Rex, only with its exact link")).toBeTruthy();
  expect(getByText("Add vet notes and prescriptions")).toBeTruthy();
  expect(getByText("Add vaccinations")).toBeTruthy();
  expect(queryByText(/^Until/)).toBeNull();
  expect(getByText("Choose what to share")).toBeTruthy();
  expect(getByText("Approve all asked")).toBeTruthy();
  expect(getByText("Deny")).toBeTruthy();
});

test("Choose what to share opens the sheet for that vet and approves nothing by itself", () => {
  mockGrants = list(request());
  const { getByTestId } = render(<DataAccessScreen />);

  fireEvent.press(getByTestId("data-access-choose-11"));

  expect(getByTestId("vet-share-sheet").props.children).toBe("5:Happy Paws");
  expect(mockMutate).not.toHaveBeenCalled();
});

test("approving as asked shows the whole list and its length, and only then approves", () => {
  Alert.alert.mockImplementation(() => {});
  mockGrants = list(request());
  const { getByTestId } = render(<DataAccessScreen />);

  fireEvent.press(getByTestId("data-access-approve-11"));

  expect(mockMutate).not.toHaveBeenCalled();
  const [title, body, buttons] = Alert.alert.mock.calls[0];
  expect(title).toBe("Approve everything asked?");
  expect(body).toMatch(/^Until you revoke it, Happy Paws will get this for Rex:\n/);
  for (const line of [
    "Medical profile, emergency contact, insurance and medical notes",
    "All vet notes, yours and the ones vets added",
    "Vaccinations",
    "A private file of Rex, only with its exact link",
    "Add vet notes and prescriptions",
    "Add vaccinations",
  ]) {
    expect(body).toContain(`• ${line}`);
  }
  buttons.find((b) => b.text === "Approve").onPress();
  expect(mockMutate).toHaveBeenCalledWith({ grantId: 11, action: "approve" }, expect.any(Object));
});

test("a request without record access has no section choice, and is confirmed with what it opens", () => {
  Alert.alert.mockImplementation(() => {});
  mockGrants = list(request({ scopes: ["health_logs_write"] }));
  const { getByTestId, queryByTestId, getByText } = render(<DataAccessScreen />);

  expect(queryByTestId("data-access-choose-11")).toBeNull();
  expect(getByText("Approve")).toBeTruthy();
  fireEvent.press(getByTestId("data-access-approve-11"));

  expect(Alert.alert.mock.calls[0][0]).toBe("Approve request?");
  expect(Alert.alert.mock.calls[0][1]).toContain("• Record walks, grooming, daycare, sitting and training sessions");
});

test("against a server without sections, no section choice is offered", () => {
  mockGrants = list(request({ sections: undefined }));
  const { queryByTestId, getByTestId } = render(<DataAccessScreen />);
  expect(queryByTestId("data-access-choose-11")).toBeNull();
  expect(getByTestId("data-access-approve-11")).toBeTruthy();
});

test("Deny confirms then calls useUpdateGrant with action 'deny'", () => {
  mockGrants = {
    data: [{ id: 11, status: "pending", provider_name: "Happy Paws", scopes: [] }],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const { getByText } = render(<DataAccessScreen />);

  fireEvent.press(getByText("Deny"));

  expect(Alert.alert).toHaveBeenCalled();
  expect(mockMutate).toHaveBeenCalledWith(
    { grantId: 11, action: "deny" },
    expect.any(Object),
  );
});

test("a grant by section shows exactly its sections and end date", () => {
  mockGrants = list({
    id: 22,
    status: "active",
    provider_name: "City Vet",
    pet_name: "Rex",
    scopes: ["record_sections"],
    sections: ["vaccines", "lab_results"],
    granted_at: "2026-06-01T12:00:00Z",
    expires_at: "2999-03-05T12:00:00Z",
  });
  const { getByText, queryByText } = render(<DataAccessScreen />);

  expect(getByText("City Vet")).toBeTruthy();
  expect(getByText("has access to Rex")).toBeTruthy();
  expect(getByText("Can see (read only):")).toBeTruthy();
  expect(getByText("Vaccinations")).toBeTruthy();
  expect(getByText("Lab results")).toBeTruthy();
  expect(queryByText("Insurance")).toBeNull();
  expect(queryByText("record_sections")).toBeNull();
  expect(getByText(/^Until .*2999$/)).toBeTruthy();
  expect(getByText(/^Granted .*2026$/)).toBeTruthy();
  expect(getByText("Revoke access")).toBeTruthy();
});

test("an older grant is listed as the whole bundle, until revoked", () => {
  mockGrants = list({
    id: 23,
    status: "active",
    provider_name: "City Vet",
    scopes: ["medical_read"],
    sections: null,
    expires_at: null,
  });
  const { getByText } = render(<DataAccessScreen />);

  expect(getByText("Older access, all together:")).toBeTruthy();
  expect(getByText("Medical profile, emergency contact, insurance and medical notes")).toBeTruthy();
  expect(getByText("Until you revoke it")).toBeTruthy();
});

test("Revoke confirms then calls useUpdateGrant with action 'revoke'", () => {
  mockGrants = {
    data: [
      {
        id: 22,
        status: "active",
        provider_name: "City Vet",
        scopes: [],
        expires_at: null,
      },
    ],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const { getByText } = render(<DataAccessScreen />);

  fireEvent.press(getByText("Revoke access"));

  expect(Alert.alert).toHaveBeenCalled();
  expect(mockMutate).toHaveBeenCalledWith(
    { grantId: 22, action: "revoke" },
    expect.any(Object),
  );
});

test.each([
  ["reported as expired", "expired", false],
  ["still reported active past its date", "active", true],
])("a grant %s is shown as ended, not as access", (_name, status, removable) => {
  mockGrants = list({
    id: 33,
    status,
    provider_name: "Expired Vet",
    scopes: ["record_sections"],
    sections: ["files"],
    expires_at: "2000-01-01T12:00:00Z",
  });
  const { getByText, queryByTestId } = render(<DataAccessScreen />);

  expect(getByText("No one has access yet.")).toBeTruthy();
  expect(getByText("ENDED")).toBeTruthy();
  expect(getByText("had access to your pet")).toBeTruthy();
  expect(getByText(/^Ended on .*2000$/)).toBeTruthy();
  expect(!!queryByTestId("data-access-revoke-33")).toBe(removable);
});

test("the owner can open the share-with-your-vet sheet", () => {
  const { getByTestId, queryByTestId } = render(<DataAccessScreen />);
  expect(queryByTestId("vet-share-sheet")).toBeNull();
  fireEvent.press(getByTestId("data-access-share"));
  expect(getByTestId("vet-share-sheet").props.children).toBe("any");
});

test("a family member is not offered the share", () => {
  mockCurrentPet = { data: { id: 7, name: "Rex", is_shared: true } };
  const { queryByTestId } = render(<DataAccessScreen />);
  expect(queryByTestId("data-access-share")).toBeNull();
});

describe("a request from a business with no booking for the dog", () => {
  const unbooked = [
    ["no booking at all", () => booked()],
    ["a booking for another dog", () => booked({ pet_id: 8, provider_id: 5, booking_status: "confirmed" })],
    ["a booking with another business", () => booked({ pet_id: 7, provider_id: 6, booking_status: "confirmed" })],
    ["only a cancelled booking", () => booked({ pet_id: 7, provider_id: 5, booking_status: "cancelled" })],
    ["only a declined booking", () => booked({ pet_id: 7, provider_id: 5, booking_status: "declined" })],
    ["bookings not loaded", () => ({ data: undefined, refetch: jest.fn() })],
  ];

  test.each(unbooked)("%s: only choosing the sections or denying, after checking the name", (_name, bookings) => {
    mockBookings = bookings();
    mockGrants = list(request({ scopes: ["medical_read"] }));
    const { getByTestId, queryByTestId, queryByText, getByText } = render(<DataAccessScreen />);

    expect(getByText("Before approving, check that “Happy Paws” is really your vet.")).toBeTruthy();
    expect(getByTestId("data-access-choose-11")).toBeTruthy();
    expect(getByTestId("data-access-deny-11")).toBeTruthy();
    expect(queryByTestId("data-access-approve-11")).toBeNull();
    expect(queryByText("Approve all asked")).toBeNull();
    expect(queryByText("Approve")).toBeNull();
  });

  test("Choose what to share carries the reminder to check the name, and approves nothing", () => {
    mockBookings = booked();
    mockGrants = list(request({ scopes: ["medical_read"] }));
    const { getByTestId } = render(<DataAccessScreen />);

    fireEvent.press(getByTestId("data-access-choose-11"));

    expect(getByTestId("vet-share-sheet").props.children).toBe("5:Happy Paws:check-name");
    expect(mockMutate).not.toHaveBeenCalled();
  });

  test("a request that does not ask for the record is not approvable as asked either", () => {
    mockBookings = booked();
    mockGrants = list(request({ scopes: ["health_logs_write"] }));
    const { getByTestId, queryByTestId } = render(<DataAccessScreen />);
    expect(getByTestId("data-access-choose-11")).toBeTruthy();
    expect(queryByTestId("data-access-approve-11")).toBeNull();
  });

  test("against a server without sections it can only be denied", () => {
    mockBookings = booked();
    mockGrants = list(request({ sections: undefined }));
    const { getByTestId, queryByTestId } = render(<DataAccessScreen />);
    expect(queryByTestId("data-access-choose-11")).toBeNull();
    expect(queryByTestId("data-access-approve-11")).toBeNull();
    expect(getByTestId("data-access-deny-11")).toBeTruthy();
  });

  test("a business with a booking gets no note", () => {
    mockGrants = list(request());
    const { queryByTestId } = render(<DataAccessScreen />);
    expect(queryByTestId("data-access-check-name-11")).toBeNull();
  });
});

test("opening the screen reads the requests and bookings again", () => {
  render(<DataAccessScreen />);
  expect(mockGrants.refetch).toHaveBeenCalled();
  expect(mockBookings.refetch).toHaveBeenCalled();
});

test("the owner's record links for this dog are listed here, without creating; a family member has none", () => {
  expect(render(<DataAccessScreen />).getByTestId("record-links").props.children).toBe("7");
  mockCurrentPet = { data: { id: 7, name: "Rex", is_shared: true } };
  expect(render(<DataAccessScreen />).queryByTestId("record-links")).toBeNull();
});


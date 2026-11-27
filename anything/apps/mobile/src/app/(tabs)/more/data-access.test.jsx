// Render pins for the owner's Data Access (care-access trust) screen:
//   - pending requests spell out what they ask for; approving them as asked goes through a confirmation that lists it
//     all, and a record request can be answered by choosing sections instead (the share sheet, for that vet);
//   - a request from a business with no booking for the dog (every invite by link) is never approved as asked: only
//     "Choose what to share" or "Deny", after a note to check the name;
//   - "Who has access" lists what useWhoHasAccess answers (every dog, every way of sharing; the dog on screen first):
//     a vet grant shows exactly which sections and until when, with Revoke (through a confirm Alert); a record link is
//     removed here; family and emergency card links open their own screen for that dog;
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
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
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

const mockRemoveLink = jest.fn();
let mockLinkInfo;
jest.mock("@/hooks/useRecordLinks", () => ({
  useRecordLinks: () => ({ data: mockLinkInfo }),
  useRevokeRecordLink: () => ({ mutate: mockRemoveLink, isPending: false }),
}));
// The list itself is the server's (hooks/useWhoHasAccess has its own tests, WhoHasAccess.test.jsx).
let mockAccess;
jest.mock("@/hooks/useWhoHasAccess", () => ({ useWhoHasAccess: () => mockAccess }));
// The invitations block has its own tests (components/Health/VetShare/ShareOffers.test.jsx).
jest.mock("@/hooks/useShareOffers", () => ({ useShareOffers: () => ({ refetch: jest.fn() }) }));
jest.mock("@/components/Health/VetShare/ShareOffers", () => {
  const { Text } = require("react-native");
  return { __esModule: true, default: ({ pet }) => <Text testID="share-offers">{String(pet.id)}</Text> };
});
jest.mock("@/components/Health/VetShare/ShareWithVetSheet", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ pet, provider, editLink }) => {
      let about = "any";
      if (provider) about = `${provider.providerId}:${provider.name}${provider.checkName ? ":check-name" : ""}`;
      if (editLink) about = `link ${editLink.id}`;
      return (
        <>
          <Text testID="vet-share-sheet">{about}</Text>
          <Text testID="vet-share-sheet-pet">{pet.id}</Text>
        </>
      );
    },
  };
});

import DataAccessScreen from "./data-access";

const accessList = (...entries) => ({
  data: { entries, partial: false },
  isError: false,
  refetch: jest.fn(),
});
const vet = (over) => ({
  kind: "vet",
  id: 22,
  pet_id: 7,
  pet_name: "Rex",
  provider_id: 5,
  provider_name: "City Vet",
  scopes: ["record_sections"],
  sections: ["vaccines"],
  expires_at: null,
  ...over,
});

beforeEach(() => {
  mockPush.mockReset();
  mockRemoveLink.mockReset();
  mockAccess = accessList();
  mockLinkInfo = undefined;
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
  mockAccess = accessList(
    vet({
      sections: ["vaccines", "lab_results"],
      granted_at: "2026-06-01T12:00:00Z",
      expires_at: "2999-03-05T12:00:00Z",
    }),
  );
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
  mockAccess = accessList(vet({ id: 23, scopes: ["medical_read"], sections: null }));
  const { getByText } = render(<DataAccessScreen />);

  expect(getByText("Older access, all together:")).toBeTruthy();
  expect(getByText("Medical profile, emergency contact, insurance and medical notes")).toBeTruthy();
  expect(getByText("Until you revoke it")).toBeTruthy();
});

test("Revoke confirms then calls useUpdateGrant with action 'revoke'", () => {
  mockAccess = accessList(vet({ scopes: [] }));
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

describe("Who has access", () => {
  const everything = () =>
    accessList(
      vet({ id: 30, pet_id: 8, pet_name: "Luna" }),
      {
        kind: "record_link", id: 41, pet_id: 7, pet_name: "Rex", sections: ["files"], allow_notes: true,
        expires_at: "2999-03-05T12:00:00Z",
      },
      { kind: "emergency_link", id: 7, pet_id: 8, pet_name: "Luna", scope: "basic", expires_at: null },
      {
        kind: "family", id: 9, pet_id: 8, pet_name: "Luna", role: "caregiver", grantee_username: "maria",
        expires_at: null,
      },
    );

  test("lists every dog's access, the dog on screen first, each labelled with its dog", () => {
    mockAccess = everything();
    const { getAllByTestId, getByTestId } = render(<DataAccessScreen />);

    expect(getAllByTestId(/^access-entry-(vet|record_link|emergency_link|family)-\d+$/).map((n) => n.props.testID))
      .toEqual([
        "access-entry-record_link-41",
        "access-entry-vet-30",
        "access-entry-emergency_link-7",
        "access-entry-family-9",
      ]);
    expect(getByTestId("access-entry-pet-record_link-41").props.children).toBe("opens Rex's data");
    expect(getByTestId("access-entry-pet-vet-30").props.children).toBe("has access to Luna");
    expect(getByTestId("access-entry-pet-family-9").props.children).toBe("has access to Luna");
  });

  test("each entry says what it opens and until when", () => {
    mockAccess = everything();
    const { getByText, getAllByText } = render(<DataAccessScreen />);

    expect(getByText("Can add vet notes")).toBeTruthy();
    expect(getByText("Documents")).toBeTruthy();
    expect(getByText(/^Only name, photo, species, breed and microchip/)).toBeTruthy();
    expect(getByText("@maria")).toBeTruthy();
    expect(getByText(/log walks, meals and care. No vet records/)).toBeTruthy();
    expect(getByText(/^Until .*2999$/)).toBeTruthy();
    expect(getAllByText("Until you revoke it")).toHaveLength(3);
  });

  test("a record link is removed here, after asking", () => {
    mockAccess = everything();
    const { getByTestId } = render(<DataAccessScreen />);

    fireEvent.press(getByTestId("record-link-remove-41"));

    expect(Alert.alert.mock.calls[0][0]).toBe("Remove this link?");
    expect(mockRemoveLink).toHaveBeenCalledWith(41);
  });

  test("revoking another dog's vet says which dog the grant is for", () => {
    mockAccess = everything();
    const { getByTestId } = render(<DataAccessScreen />);

    fireEvent.press(getByTestId("data-access-revoke-30"));

    expect(Alert.alert.mock.calls[0][1]).toContain("Luna");
    expect(mockMutate).toHaveBeenCalledWith(
      { grantId: 30, action: "revoke", petId: 8 },
      expect.any(Object),
    );
  });

  test("emergency card links and family are managed on their own screen, for that dog", () => {
    mockAccess = everything();
    const { getByTestId } = render(<DataAccessScreen />);

    fireEvent.press(getByTestId("access-manage-emergency_link-7"));
    fireEvent.press(getByTestId("access-manage-family-9"));

    expect(mockPush.mock.calls).toEqual([["/emergency-card?petId=8"], ["/pet-sharing?petId=8"]]);
  });

  test("without the server's support nothing can be edited", () => {
    mockAccess = everything();
    mockLinkInfo = { editAccessAvailable: false };
    const { queryByTestId } = render(<DataAccessScreen />);

    expect(queryByTestId("access-edit-vet-30")).toBeNull();
    expect(queryByTestId("access-edit-record_link-41")).toBeNull();
  });

  test("a grant by section and a record link can be edited, each for its own dog", () => {
    mockAccess = everything();
    mockGrants = { ...list(), editAccessAvailable: true };
    mockLinkInfo = { editAccessAvailable: true };
    const { getByTestId, queryByTestId } = render(<DataAccessScreen />);

    fireEvent.press(getByTestId("access-edit-vet-30"));
    expect(getByTestId("vet-share-sheet").props.children).toBe("5:City Vet");
    expect(getByTestId("vet-share-sheet-pet").props.children).toBe(8);

    fireEvent.press(getByTestId("access-edit-record_link-41"));
    expect(getByTestId("vet-share-sheet").props.children).toBe("link 41");
    expect(getByTestId("vet-share-sheet-pet").props.children).toBe(7);

    // Family and emergency card links are not edited here.
    expect(queryByTestId("access-edit-family-9")).toBeNull();
    expect(queryByTestId("access-edit-emergency_link-7")).toBeNull();
  });

  test("an older grant has no edit; what a vet can add is shown", () => {
    mockAccess = accessList(
      vet({ id: 23, scopes: ["medical_read"], sections: null }),
      vet({ id: 24, edit_sections: ["vaccines"] }),
    );
    mockGrants = { ...list(), editAccessAvailable: true };
    const { getByTestId, queryByTestId, getByText } = render(<DataAccessScreen />);

    expect(queryByTestId("access-edit-vet-23")).toBeNull();
    expect(getByTestId("access-edit-vet-24")).toBeTruthy();
    expect(getByText("Can add:")).toBeTruthy();
  });

  test("a failed read offers to try again and never says nobody has access", () => {
    mockAccess = { data: undefined, isError: true, refetch: jest.fn() };
    const { getByTestId, queryByText } = render(<DataAccessScreen />);

    expect(queryByText("No one has access yet.")).toBeNull();
    fireEvent.press(getByTestId("who-has-access-retry"));
    expect(mockAccess.refetch).toHaveBeenCalled();
  });

  test("against a server without the single list, says what is managed elsewhere", () => {
    mockAccess = { ...accessList(), data: { entries: [], partial: true } };
    expect(render(<DataAccessScreen />).getByTestId("who-has-access-partial")).toBeTruthy();
  });
});

test("the owner's waiting invitations for this dog are listed; a family member has none", () => {
  expect(render(<DataAccessScreen />).getByTestId("share-offers").props.children).toBe("7");
  mockCurrentPet = { data: { id: 7, name: "Rex", is_shared: true } };
  expect(render(<DataAccessScreen />).queryByTestId("share-offers")).toBeNull();
});


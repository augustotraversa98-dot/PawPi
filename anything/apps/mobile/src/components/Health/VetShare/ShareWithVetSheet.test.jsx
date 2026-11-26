// Sharing the vet record: nothing is selected for the owner; a vet, at least one section and a length are required;
// a review says who can see what; consent is explicit; the app never claims more than the server confirmed. Runs the
// real hooks' contract through a mocked useShareRecord (its checks are covered in hooks/useShareRecord.test.jsx).

import React from "react";
import { render, fireEvent, act, within } from "@testing-library/react-native";
import { Alert } from "react-native";
import ShareWithVetSheet from "./ShareWithVetSheet";
import { SHARE_EXPIRIES, SHARE_SECTIONS } from "@/utils/vetShare";

const mockLangRef = { current: "en" };
let mockBookings;
let mockGrants;
let mockShareOptions;
const mockShare = jest.fn();
const mockRevoke = jest.fn(() => Promise.resolve({}));
const mockPush = jest.fn();

jest.mock("react-i18next", () => ({
  useTranslation: () => require("@/i18n/testMock").makeReactI18nextMock(mockLangRef.current).useTranslation(),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("@/components/KeyboardSafeFormModal", () => {
  const { View, Text, TouchableOpacity } = require("react-native");
  return {
    __esModule: true,
    default: ({ title, children, ctaLabel, ctaDisabled, onCtaPress }) => (
      <View>
        <Text testID="sheet-title">{title}</Text>
        {children}
        <TouchableOpacity testID="cta" accessibilityState={{ disabled: !!ctaDisabled }} disabled={ctaDisabled} onPress={onCtaPress}>
          <Text>{ctaLabel}</Text>
        </TouchableOpacity>
      </View>
    ),
  };
});
jest.mock("@/hooks/useProviders", () => ({ useMyBookings: () => mockBookings }));
jest.mock("@/hooks/useCareAccessGrants", () => ({
  useCareAccessGrants: () => mockGrants,
  useShareRecord: (options) => {
    mockShareOptions = options;
    return { mutate: mockShare, isPending: false };
  },
  useUpdateGrant: () => ({ mutateAsync: mockRevoke, isPending: false }),
}));

const pet = { id: 7, name: "Luna", is_shared: false };
const vets = [
  { pet_id: 7, provider_id: 1, provider_name: "Happy Paws", capability: "vet" },
  { pet_id: 7, provider_id: 2, provider_name: "North Clinic", capability: "vet" },
];
const query = (data, over) => ({ data, isError: false, refetch: jest.fn(), ...over });
const sheet = (props) => <ShareWithVetSheet pet={pet} onClose={jest.fn()} onOpenRequests={jest.fn()} {...props} />;
const open = (props) => render(sheet(props));
const ctaDisabled = (s) => s.getByTestId("cta").props.accessibilityState.disabled;
const press = (s, id) => fireEvent.press(s.getByTestId(id));
const state = (s, id) => s.getByTestId(id).props.accessibilityState;

const chooseAll = (s, { vet = 1, sections = ["vaccines"], expiry = "7d" } = {}) => {
  if (vet) press(s, `vet-share-vet-${vet}`);
  sections.forEach((k) => press(s, `vet-share-section-${k}`));
  press(s, `vet-share-expiry-${expiry}`);
};

const grant = (over) => ({
  id: 4,
  provider_id: 1,
  provider_name: "Happy Paws",
  status: "active",
  scopes: ["record_sections"],
  sections: ["vaccines"],
  expires_at: null,
  ...over,
});

let alertPress;
beforeEach(() => {
  mockLangRef.current = "en";
  mockShare.mockReset();
  mockRevoke.mockClear();
  mockPush.mockReset();
  mockBookings = query({ upcoming: vets, past: [] });
  mockGrants = query([]);
  alertPress = true;
  jest.spyOn(Alert, "alert").mockImplementation((title, msg, buttons = []) => {
    if (alertPress) buttons.find((b) => b.style === "destructive")?.onPress?.();
  });
});
afterEach(() => jest.restoreAllMocks());

const answer = (result, sent) =>
  act(() => {
    mockShareOptions.onSuccess(result, sent);
  });
const sent = { providerName: "Happy Paws", sections: ["vaccines", "files"], expiry: "7d" };
const lastAlert = () => Alert.alert.mock.calls[Alert.alert.mock.calls.length - 1];

test("nothing is selected: no vet, none of the 8 sections, none of the 4 lengths", () => {
  const s = open();
  expect(state(s, "vet-share-vet-1").selected).toBe(false);
  SHARE_SECTIONS.forEach((k) => expect(state(s, `vet-share-section-${k}`).checked).toBe(false));
  SHARE_EXPIRIES.forEach((k) => expect(state(s, `vet-share-expiry-${k}`).selected).toBe(false));
  expect(ctaDisabled(s)).toBe(true);
  expect(s.getByText(/Never shared from here: the allergy, condition, surgery, medication/)).toBeTruthy();
});

test("each section says what it opens", () => {
  const s = open();
  expect(s.getByText(/Microchip, spay\/neuter.*Not the emergency contact or insurance/)).toBeTruthy();
  expect(s.getByText(/Insurance company and policy number/)).toBeTruthy();
  expect(s.getByText(/All history entries for Luna: yours and the ones vets added/)).toBeTruthy();
});

test.each([
  ["the vet", { vet: null }],
  ["a section", { sections: [] }],
])("review stays closed without %s", (_name, over) => {
  const s = open();
  chooseAll(s, over);
  expect(ctaDisabled(s)).toBe(true);
  press(s, "cta");
  expect(s.queryByTestId("vet-share-review")).toBeNull();
});

test("review stays closed without a length", () => {
  const s = open();
  press(s, "vet-share-vet-1");
  press(s, "vet-share-section-vaccines");
  expect(ctaDisabled(s)).toBe(true);
});

test("review says who sees what and until when; nothing is sent before consent", () => {
  const s = open();
  chooseAll(s, { sections: ["vaccines", "profile"] });
  expect(s.getByText("Review")).toBeTruthy();
  press(s, "cta");

  expect(s.getByText("Everyone on Happy Paws's PawPi team")).toBeTruthy();
  const can = within(s.getByTestId("vet-share-review-sections"));
  expect(can.getByText("Medical profile")).toBeTruthy();
  expect(can.getByText("Vaccinations")).toBeTruthy();
  expect(can.queryByText("Insurance")).toBeNull();
  const not = within(s.getByTestId("vet-share-review-not-shared"));
  expect(not.getByText("Insurance")).toBeTruthy();
  expect(not.getByText("Lab results")).toBeTruthy();
  expect(not.queryByText("Vaccinations")).toBeNull();
  expect(within(s.getByTestId("vet-share-review-until")).getByText(/^Until .*\d{4}, unless you revoke it sooner$/)).toBeTruthy();

  expect(state(s, "vet-share-consent").checked).toBe(false);
  expect(ctaDisabled(s)).toBe(true);
  press(s, "cta");
  expect(mockShare).not.toHaveBeenCalled();

  press(s, "vet-share-consent");
  press(s, "cta");
  expect(mockShare).toHaveBeenCalledTimes(1);
  expect(mockShare.mock.calls[0][0]).toEqual({
    petId: 7,
    providerId: 1,
    providerName: "Happy Paws",
    sections: ["profile", "vaccines"], // the contract's order, whatever order they were ticked in
    expiry: "7d",
  });
});

test("until revoked is said as such, in the review and in the consent", () => {
  const s = open();
  chooseAll(s, { expiry: "until_revoked" });
  press(s, "cta");
  expect(within(s.getByTestId("vet-share-review-until")).getByText("Until you revoke it")).toBeTruthy();
  expect(s.getByText(/listed above until I revoke access\./)).toBeTruthy();
});

test("going back keeps the choices and asks consent again", () => {
  const s = open();
  chooseAll(s);
  press(s, "cta");
  press(s, "vet-share-consent");
  press(s, "vet-share-back");
  expect(state(s, "vet-share-section-vaccines").checked).toBe(true);
  press(s, "cta");
  expect(state(s, "vet-share-consent").checked).toBe(false);
});

test("choices are not carried over to another vet", () => {
  const s = open();
  chooseAll(s);
  press(s, "vet-share-vet-2");
  expect(state(s, "vet-share-section-vaccines").checked).toBe(false);
  expect(state(s, "vet-share-expiry-7d").selected).toBe(false);
  expect(ctaDisabled(s)).toBe(true);
});

test("a vet with a pending request can be answered from here, and the review says what that does", () => {
  mockGrants = query([grant({ id: 5, status: "pending", scopes: ["medical_read", "medical_write"], sections: null })]);
  const s = open();
  expect(s.getByText("Asked for access")).toBeTruthy();
  chooseAll(s);
  press(s, "cta");
  expect(s.getByTestId("vet-share-pending-note")).toBeTruthy();
  expect(s.getByText(/nothing else they asked for/)).toBeTruthy();
  press(s, "vet-share-consent");
  press(s, "cta");
  expect(mockShare.mock.calls[0][0]).toMatchObject({ providerId: 1, sections: ["vaccines"], expiry: "7d" });
});

test("a vet who already has access can be changed, and is told it replaces it", () => {
  mockGrants = query([grant()]);
  const s = open();
  chooseAll(s, { sections: ["files"] });
  press(s, "cta");
  expect(s.getByTestId("vet-share-replace-note")).toBeTruthy();
});

test("the list shows each section grant with exactly its sections and end", () => {
  mockGrants = query([
    grant({ sections: ["vaccines", "photos"], expires_at: "2999-03-05T12:00:00Z" }),
  ]);
  const s = open();
  const card = within(s.getByTestId("grant-access-4"));
  expect(card.getByText("Can see (read only):")).toBeTruthy();
  expect(card.getByText("Vaccinations")).toBeTruthy();
  expect(card.getByText("Photo checks")).toBeTruthy();
  expect(card.queryByText("Insurance")).toBeNull();
  expect(card.getByText(/^Until .*2999$/)).toBeTruthy();
});

test("an older grant is listed as the whole bundle it opens, until revoked", () => {
  mockGrants = query([grant({ scopes: ["medical_read"], sections: null })]);
  const s = open();
  const card = within(s.getByTestId("grant-access-4"));
  expect(card.getByText("Older access, all together:")).toBeTruthy();
  expect(card.getByText("Medical profile, emergency contact, insurance and medical notes")).toBeTruthy();
  expect(card.getByText("All vet notes, yours and the ones vets added")).toBeTruthy();
  expect(card.getByText("Vaccinations")).toBeTruthy();
  expect(card.getByText("A private file of Luna, only with its exact link")).toBeTruthy();
  expect(card.getByText("Until you revoke it")).toBeTruthy();
  expect(s.getByTestId("vet-share-revoke-4")).toBeTruthy();
});

test("an expired grant is shown as ended, with nothing to revoke", () => {
  mockGrants = query([grant({ status: "expired", expires_at: "2000-01-01T12:00:00Z" })]);
  const s = open();
  expect(s.getByText("Ended")).toBeTruthy();
  expect(s.getByText(/^Ended on .*2000$/)).toBeTruthy();
  expect(s.getByText("Could see (read only):")).toBeTruthy();
  expect(s.getByText("No one has access yet.")).toBeTruthy();
  expect(s.queryByTestId("vet-share-revoke-4")).toBeNull();
});

test("a past-date grant still reported active is ended too, and can be removed", () => {
  mockGrants = query([grant({ expires_at: "2000-01-01T12:00:00Z" })]);
  const s = open();
  expect(s.getByText(/^Ended on/)).toBeTruthy();
  expect(s.getByTestId("vet-share-revoke-4")).toBeTruthy();
});

test("revoke asks first, then revokes that grant", () => {
  mockGrants = query([grant()]);
  const s = open();
  alertPress = false;
  press(s, "vet-share-revoke-4");
  expect(mockRevoke).not.toHaveBeenCalled();
  alertPress = true;
  press(s, "vet-share-revoke-4");
  expect(mockRevoke).toHaveBeenCalledWith({ grantId: 4, action: "revoke" });
});

test("against a server without sections nothing can be shared, and access can still be revoked", () => {
  mockGrants = query([{ id: 4, provider_id: 1, provider_name: "Happy Paws", status: "active", scopes: ["medical_read"] }]);
  const s = open();
  expect(s.getByTestId("vet-share-unsupported")).toBeTruthy();
  expect(s.queryByTestId("vet-share-vet-1")).toBeNull();
  expect(s.queryByTestId("vet-share-section-vaccines")).toBeNull();
  expect(ctaDisabled(s)).toBe(true);
  expect(s.getByTestId("vet-share-revoke-4")).toBeTruthy();
});

test("confirmed: says which sections and until when", () => {
  const s = open();
  answer({ outcome: "shared", grant: grant({ expires_at: "2999-03-05T12:00:00Z" }) }, sent);
  expect(lastAlert()[0]).toBe("Access given");
  expect(lastAlert()[1]).toMatch(/^Until .*2999, Happy Paws can see these parts of Luna's record: Vaccinations, Documents\.$/);
  expect(s.queryByTestId("vet-share-review")).toBeNull();
});

test.each([
  ["rolledBack", "Your choice wasn't applied", /revoked right away: nothing from this attempt stays shared/],
  ["notApplied", "Nothing was shared", /nothing new was shared/],
  ["unconfirmed", "Couldn't share", /couldn't confirm/],
])("%s never claims access was given", (outcome, title, body) => {
  open();
  answer({ outcome, grant: grant() }, sent);
  expect(lastAlert()[0]).toBe(title);
  expect(lastAlert()[1]).toMatch(body);
  expect(mockRevoke).not.toHaveBeenCalled();
});

test.each([
  ["rollbackFailed", "Revoke this access", /couldn't remove it/],
  ["unchanged", "Your choice wasn't applied", /access they had before/],
])("%s tells the owner and offers to revoke", (outcome, title, body) => {
  alertPress = false;
  open();
  answer({ outcome, grant: grant({ id: 91 }) }, sent);
  expect(lastAlert()[0]).toBe(title);
  expect(lastAlert()[1]).toMatch(body);
  expect(mockRevoke).not.toHaveBeenCalled();
  act(() => {
    lastAlert()[2].find((b) => b.style === "destructive").onPress();
  });
  expect(mockRevoke).toHaveBeenCalledWith({ grantId: 91, action: "revoke" });
});

test.each([
  [400, /wasn't accepted, so nothing was shared/],
  [404, /no longer available for sharing/],
  [409, /changed while you were choosing/],
  [500, /couldn't confirm the result/],
  [undefined, /couldn't confirm the result/],
])("a %s refusal has its own clear message and re-reads access", (status, body) => {
  const s = open();
  chooseAll(s);
  press(s, "cta");
  act(() => {
    mockShareOptions.onError(Object.assign(new Error("server words"), { status }), sent);
  });
  expect(lastAlert()[0]).toBe("Couldn't share");
  expect(lastAlert()[1]).toMatch(body);
  expect(lastAlert()[1]).not.toMatch(/server words/);
  expect(mockGrants.refetch).toHaveBeenCalledTimes(2);
  expect(s.queryByTestId("vet-share-review")).toBeNull();
});

test("opened for one provider: no vet list, still nothing selected, shares with that one", () => {
  mockBookings = query(undefined);
  const s = open({ provider: { providerId: 9, name: "Vet A" } });
  expect(s.getByTestId("sheet-title").props.children).toBe("Share the medical record");
  expect(s.queryByTestId("vet-share-vet-1")).toBeNull();
  expect(ctaDisabled(s)).toBe(true);
  chooseAll(s, { vet: null, sections: ["insurance"], expiry: "30d" });
  press(s, "cta");
  press(s, "vet-share-consent");
  press(s, "cta");
  expect(mockShare.mock.calls[0][0]).toMatchObject({ providerId: 9, sections: ["insurance"], expiry: "30d" });
});

test("re-reads current access and bookings when it opens, not cached ones", () => {
  open();
  expect(mockGrants.refetch).toHaveBeenCalledTimes(1);
  expect(mockBookings.refetch).toHaveBeenCalledTimes(1);
});

test("pending requests are counted and can be opened", () => {
  mockGrants = query([grant({ id: 5, status: "pending", sections: null, scopes: ["medical_read"] })]);
  const onOpenRequests = jest.fn();
  const s = open({ onOpenRequests });
  fireEvent.press(s.getByText("See requests"));
  expect(onOpenRequests).toHaveBeenCalled();
});

test("nothing can be picked while current access is unknown", () => {
  mockGrants = query(undefined, { isError: true });
  const s = open();
  expect(s.queryByTestId("vet-share-vet-1")).toBeNull();
  expect(s.queryByTestId("vet-share-section-vaccines")).toBeNull();
  expect(s.getByText("Try again")).toBeTruthy();
  expect(ctaDisabled(s)).toBe(true);
});

test("no vet booking → empty state, and the emergency card link is offered", () => {
  mockBookings = query({ upcoming: [], past: [] });
  const onClose = jest.fn();
  const s = open({ onClose });
  expect(s.getByText(/You don't have a vet booking for Luna yet/)).toBeTruthy();
  expect(s.queryByTestId("vet-share-section-vaccines")).toBeNull();
  fireEvent.press(s.getByText("Open the emergency card"));
  expect(onClose).toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith("/emergency-card?petId=7");
});

test("a family member is told only the owner can share", () => {
  const onClose = jest.fn();
  const s = open({ pet: { ...pet, is_shared: true }, onClose });
  expect(s.getByText(/Only Luna's owner can give a vet access/)).toBeTruthy();
  expect(s.queryByTestId("vet-share-vet-1")).toBeNull();
  press(s, "cta");
  expect(onClose).toHaveBeenCalled();
  expect(mockShare).not.toHaveBeenCalled();
  expect(mockGrants.refetch).not.toHaveBeenCalled();
});

test("Spanish copy (voseo)", () => {
  mockLangRef.current = "es";
  const s = open();
  expect(s.getByText("Qué compartir")).toBeTruthy();
  expect(s.getByText(/No hay nada marcado de antemano\. Elegí al menos una parte\./)).toBeTruthy();
  chooseAll(s, { expiry: "until_revoked" });
  fireEvent.press(s.getByText("Revisar"));
  expect(s.getByText("Quién puede ver qué")).toBeTruthy();
  expect(s.getByText("Dar acceso")).toBeTruthy();
  expect(s.getByText(/Acepto que todo el equipo de Happy Paws/)).toBeTruthy();
});

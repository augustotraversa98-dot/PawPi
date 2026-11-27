// The sharing screens stay current, with the real screens, sheet and hooks over a mocked server:
//   - an answer given on this phone shows in the same moment, before anything is read again;
//   - an answer given on another phone shows within a few seconds while something is waiting, and at once when the app
//     or the screen comes back or a sharing notification arrives;
//   - tapping twice sends one request.

import React from "react";
import { Alert, TouchableOpacity } from "react-native";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { NavigationContext } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import DataAccessScreen from "@/app/(tabs)/more/data-access";
import ShareWithVetSheet from "./ShareWithVetSheet";
import { SHARING_POLL_MS, useSharingLive } from "@/hooks/useSharingLive";
import { registerSharingNotificationRefresh } from "@/utils/notificationDeepLink";

jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }), router: { push: jest.fn() } }));
jest.mock("expo-notifications", () => ({ addNotificationReceivedListener: jest.fn() }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("@/hooks/useBottomClearance", () => ({ __esModule: true, default: () => 0 }));
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
jest.mock("@/components/KeyboardSafeFormModal", () => {
  const { View, Text, TouchableOpacity } = require("react-native");
  return {
    __esModule: true,
    default: ({ children, ctaLabel, ctaDisabled, onCtaPress }) => (
      <View>
        {children}
        <TouchableOpacity testID="cta" accessibilityState={{ disabled: !!ctaDisabled }} disabled={ctaDisabled} onPress={onCtaPress}>
          <Text>{ctaLabel}</Text>
        </TouchableOpacity>
      </View>
    ),
  };
});
const mockQuery = (data) => ({ data, isError: false, refetch: jest.fn() });
const mockPet = mockQuery({ id: 7, name: "Luna", is_shared: false });
const mockBookings = mockQuery({
  upcoming: [{ id: 1, pet_id: 7, provider_id: 3, provider_name: "North Clinic", booking_status: "confirmed", capability: "vet" }],
  past: [],
});
jest.mock("@/hooks/usePetProfile", () => ({ useCurrentPet: () => mockPet }));
jest.mock("@/hooks/useProviders", () => ({ useMyBookings: () => mockBookings }));

const day = 86_400_000;
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const grant = (over) => ({
  id: 4, pet_id: 7, pet_name: "Luna", provider_id: 3, provider_name: "North Clinic", status: "active",
  scopes: ["record_sections"], sections: ["vaccines"], expires_at: null, requested_by: "owner",
  granted_at: new Date().toISOString(), ...over,
});
const asked = () => grant({ status: "pending", scopes: ["medical_read"], sections: null, requested_by: "provider", granted_at: null });
const offer = (over) => ({
  id: 51, pet_id: 7, pet_name: "Luna", provider_id: 3, provider_name: "North Clinic", sections: ["vaccines"],
  expiry: "until_revoked", status: "open", created_at: new Date().toISOString(),
  lapses_at: new Date(Date.now() + 5 * day).toISOString(), ...over,
});

// The server: what each list answers now, and what it does with a write. `hold` keeps every later read unanswered.
let server;
let writes;
let reads;
let client;

beforeEach(() => {
  server = { grants: [], offers: [], invites: [], links: [], hold: false, onWrite: null };
  writes = [];
  reads = [];
  global.fetch = jest.fn((url, init) => {
    if (init?.method) {
      writes.push({ url, method: init.method, body: JSON.parse(init.body), headers: init.headers });
      return Promise.resolve(server.onWrite(url, init));
    }
    reads.push(url);
    if (server.hold) return new Promise(() => {});
    if (url.startsWith("/api/care-access/grants")) return Promise.resolve(reply({ grants: server.grants }));
    if (url.startsWith("/api/care-access/offers")) return Promise.resolve(reply({ available: true, offers: server.offers }));
    if (url.startsWith("/api/care-access/invites")) return Promise.resolve(reply({ invites: server.invites }));
    if (url.startsWith("/api/care-access/links")) return Promise.resolve(reply({ available: true, links: server.links }));
    return Promise.resolve(reply({ available: true, vets: [] }));
  });
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  focusManager.setFocused(true);
});
afterEach(() => {
  client?.clear();
  focusManager.setFocused(undefined);
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const wrap = (node) => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 300_000 } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
};
const settle = () => waitFor(() => expect(client.isFetching()).toBe(0));
const grantReads = () => reads.filter((u) => u.startsWith("/api/care-access/grants")).length;
const later = (ms) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });
// Two calls of the handler inside one frame, before anything is redrawn.
const doubleTap = (screen, testID) => {
  const { onPress } = screen.UNSAFE_getAllByType(TouchableOpacity).find((n) => n.props.testID === testID).props;
  act(() => {
    onPress();
    onPress();
  });
};
const confirm = (label) => Alert.alert.mock.calls.at(-1)[2].find((b) => b.text === label).onPress;

describe("an answer given on this phone", () => {
  test("approving a request shows the vet under 'Who has access' before anything is read again", async () => {
    server.grants = [asked()];
    server.onWrite = () => reply({ grant: grant({ scopes: ["medical_read"], sections: null }) });
    const s = wrap(<DataAccessScreen />);
    await waitFor(() => expect(s.getByTestId("data-access-approve-4")).toBeTruthy());
    await settle();
    server.hold = true;
    fireEvent.press(s.getByTestId("data-access-approve-4"));
    await act(async () => confirm("Approve")());
    await waitFor(() => expect(s.getByTestId("data-access-revoke-4")).toBeTruthy());
    expect(s.queryByTestId("data-access-approve-4")).toBeNull();
    expect(s.queryByTestId("data-access-deny-4")).toBeNull();
  });

  test("confirming twice sends one change, and the buttons wait for it", async () => {
    server.grants = [asked()];
    let finish;
    server.onWrite = () => new Promise((resolve) => (finish = resolve));
    const s = wrap(<DataAccessScreen />);
    await waitFor(() => expect(s.getByTestId("data-access-approve-4")).toBeTruthy());
    await settle();
    // Two confirmations opened before either was answered.
    fireEvent.press(s.getByTestId("data-access-approve-4"));
    fireEvent.press(s.getByTestId("data-access-approve-4"));
    const [first, second] = Alert.alert.mock.calls.map((c) => c[2].find((b) => b.text === "Approve").onPress);
    await act(async () => {
      first();
      second();
    });
    expect(writes).toHaveLength(1);
    await waitFor(() => expect(s.UNSAFE_getAllByType(TouchableOpacity).find((n) => n.props.testID === "data-access-deny-4").props.disabled).toBe(true));
    server.grants = [grant({ scopes: ["medical_read"], sections: null })];
    await act(async () => finish(reply({ grant: server.grants[0] })));
    await waitFor(() => expect(s.getByTestId("data-access-revoke-4")).toBeTruthy());
    await settle();
    // The second confirmation, tapped after the change was applied.
    await act(async () => second());
    expect(writes).toHaveLength(1);
  });

  const openSheet = async () => {
    const onClose = jest.fn();
    const s = wrap(
      <ShareWithVetSheet pet={mockPet.data} onClose={onClose} onOpenRequests={jest.fn()} />,
    );
    await waitFor(() => expect(s.getByTestId("vet-share-vet-3")).toBeTruthy());
    await settle();
    for (const id of ["vet-share-vet-3", "vet-share-section-vaccines", "vet-share-expiry-until_revoked", "cta", "vet-share-consent"]) {
      fireEvent.press(s.getByTestId(id));
    }
    return { s, onClose };
  };

  test("sharing lists the access in the same moment, and a double tap shares once", async () => {
    let finish;
    server.onWrite = () => new Promise((resolve) => (finish = resolve));
    const { s } = await openSheet();
    doubleTap(s, "cta");
    fireEvent.press(s.getByTestId("cta"));
    await waitFor(() => expect(finish).toBeDefined());
    expect(writes).toHaveLength(1);
    expect(s.getByTestId("cta").props.accessibilityState.disabled).toBe(true);
    server.hold = true;
    const created = grant({ pet_name: undefined, provider_name: undefined });
    await act(async () => finish(reply({ grant: created }, 201)));
    await waitFor(() => expect(s.getByTestId("vet-share-revoke-4")).toBeTruthy());
    expect(Alert.alert.mock.calls.at(-1)[0]).toBe("Access given");
  });
});

describe("an answer given on another phone", () => {
  test("shows within a few seconds while an invitation is waiting", async () => {
    jest.useFakeTimers();
    server.offers = [offer()];
    const s = wrap(<DataAccessScreen />);
    await waitFor(() => expect(s.getByTestId("share-offer-row-51")).toBeTruthy());
    server.offers = [offer({ status: "accepted" })];
    server.grants = [grant()];
    await later(SHARING_POLL_MS);
    await waitFor(() => expect(s.getByTestId("data-access-revoke-4")).toBeTruthy());
    expect(s.queryByTestId("share-offer-row-51")).toBeNull();
    // Nothing is waiting any more: no more reading.
    const before = grantReads();
    await later(SHARING_POLL_MS * 4);
    expect(grantReads()).toBe(before);
  });

  test.each([
    ["a request waiting for an answer", () => (server.grants = [asked()]), 1],
    ["nothing waiting", () => (server.grants = [grant()]), 0],
  ])("polling with %s", async (_name, arrange, expected) => {
    jest.useFakeTimers();
    arrange();
    const s = wrap(<DataAccessScreen />);
    await waitFor(() => expect(s.getByTestId(expected ? "data-access-deny-4" : "data-access-revoke-4")).toBeTruthy());
    await later(0);
    const before = grantReads();
    await later(SHARING_POLL_MS);
    expect(grantReads() - before).toBe(expected);
  });

  test("is not asked for while the app is in the background, and is read as soon as it returns", async () => {
    jest.useFakeTimers();
    server.offers = [offer()];
    const s = wrap(<DataAccessScreen />);
    await waitFor(() => expect(s.getByTestId("share-offer-row-51")).toBeTruthy());
    act(() => focusManager.setFocused(false));
    server.grants = [grant()];
    server.offers = [];
    const before = grantReads();
    await later(SHARING_POLL_MS * 3);
    expect(grantReads()).toBe(before);
    await act(async () => focusManager.setFocused(true));
    await waitFor(() => expect(s.getByTestId("data-access-revoke-4")).toBeTruthy());
  });

  test("is read when a screen is returned to", async () => {
    const listeners = {};
    let focused = true;
    const navigation = {
      isFocused: () => focused,
      addListener: (name, run) => {
        listeners[name] = run;
        return () => {};
      },
    };
    const Probe = () => {
      useSharingLive();
      return null;
    };
    client = new QueryClient();
    const invalidate = jest.spyOn(client, "invalidateQueries");
    render(
      <QueryClientProvider client={client}>
        <NavigationContext.Provider value={navigation}>
          <Probe />
        </NavigationContext.Provider>
      </QueryClientProvider>,
    );
    expect(invalidate).not.toHaveBeenCalled();
    focused = false;
    act(() => listeners.blur());
    expect(invalidate).not.toHaveBeenCalled();
    focused = true;
    act(() => listeners.focus());
    expect(invalidate.mock.calls.map(([f]) => f.queryKey[0])).toEqual([
      "care-access-grants", "care-share-offers", "care-access-invites", "care-record-links", "provider-share-offers",
    ]);
  });

  test.each([
    ["care_share_accepted", true],
    ["care_share_declined", true],
    ["care_access_requested", true],
    ["care_share_offered", true],
    ["care_access_revoked", true],
    ["paw", false],
  ])("a %s notification arriving refreshes the lists: %s", async (type, refreshes) => {
    const remove = jest.fn();
    Notifications.addNotificationReceivedListener.mockReturnValue({ remove });
    client = new QueryClient();
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const stop = registerSharingNotificationRefresh(client);
    const arrive = Notifications.addNotificationReceivedListener.mock.calls.at(-1)[0];
    arrive({ request: { content: { data: { type } } } });
    expect(invalidate.mock.calls.length > 0).toBe(refreshes);
    stop();
    expect(remove).toHaveBeenCalled();
  });
});

describe("creating a link", () => {
  const start = async () => {
    const s = wrap(<ShareWithVetSheet pet={mockPet.data} onClose={jest.fn()} onOpenRequests={jest.fn()} />);
    await waitFor(() => expect(s.getByTestId("record-link-start")).toBeTruthy());
    await settle();
    for (const id of ["record-link-start", "record-link-section-vaccines", "record-link-expiry-7d"]) {
      fireEvent.press(s.getByTestId(id));
    }
    return s;
  };
  const review = (s) => {
    fireEvent.press(s.getByTestId("cta"));
    fireEvent.press(s.getByTestId("record-link-consent"));
  };

  test("a double tap sends one request, and asking again after a lost answer is the same request", async () => {
    let fail;
    server.onWrite = () => new Promise((_resolve, reject) => (fail = reject));
    const s = await start();
    review(s);
    doubleTap(s, "cta");
    await waitFor(() => expect(fail).toBeDefined());
    expect(writes).toHaveLength(1);
    await act(async () => fail(new Error("network")));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    server.onWrite = () => reply({ code: "link_already_created", linkId: 12 }, 409);
    review(s);
    fireEvent.press(s.getByTestId("cta"));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(2));
    expect(writes).toHaveLength(2);
    expect(writes[0].headers["Idempotency-Key"]).toMatch(/^[A-Za-z0-9_.:-]{8,128}$/);
    expect(writes[1].headers["Idempotency-Key"]).toBe(writes[0].headers["Idempotency-Key"]);
    expect(Alert.alert.mock.calls[1][0]).toBe("The link wasn't sent");
  });

  test("a different choice is a different request", async () => {
    server.onWrite = () => reply({}, 500);
    const s = await start();
    review(s);
    fireEvent.press(s.getByTestId("cta"));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    fireEvent.press(s.getByTestId("record-link-section-files"));
    review(s);
    fireEvent.press(s.getByTestId("cta"));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(2));
    expect(writes[1].headers["Idempotency-Key"]).not.toBe(writes[0].headers["Idempotency-Key"]);
  });
});

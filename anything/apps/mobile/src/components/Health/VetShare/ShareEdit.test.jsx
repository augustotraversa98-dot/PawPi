// The share sheet with the real hooks over a mocked server:
//   - a vet the owner already shares with is always in the picker, however it got the access, and in the search;
//   - choosing it changes that same share (PATCH "update"), never ends it and shares again;
//   - "Can add" per part, off until turned on, said in the review and the consent, and sent as chosen;
//   - a server that cannot store it shows none of this and behaves as before.

import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor, act, within } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ShareWithVetSheet from "./ShareWithVetSheet";

const mockLangRef = { current: "en" };
jest.mock("react-i18next", () => ({
  useTranslation: () => require("@/i18n/testMock").makeReactI18nextMock(mockLangRef.current).useTranslation(),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
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
const mockQuery = (data) => ({ data, isError: false, refetch: jest.fn() });
let mockBookings;
jest.mock("@/hooks/useProviders", () => ({ useMyBookings: () => mockBookings }));

const DAY = 86_400_000;
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const end = new Date(Date.now() + 20 * DAY).toISOString();
// A vet reached by search or invitation: it has access, and the owner never booked it.
const shared = (over) => ({
  id: 4, pet_id: 7, pet_name: "Luna", provider_id: 9, provider_name: "Palermo Vets", status: "active",
  scopes: ["record_sections"], sections: ["vet_notes", "vaccines"], edit_sections: ["vet_notes"],
  expires_at: end, requested_by: "owner", ...over,
});
const booking = { id: 1, pet_id: 7, provider_id: 3, provider_name: "North Clinic", booking_status: "confirmed", capability: "vet" };

let server;
let client;

beforeEach(() => {
  mockLangRef.current = "en";
  mockBookings = mockQuery({ upcoming: [booking], past: [] });
  server = { grants: [shared()], offers: [], editAccess: true, found: [], onWrite: null, writes: [] };
  global.fetch = jest.fn(async (url, init) => {
    if (init?.method) {
      server.writes.push([url, init.method, JSON.parse(init.body)]);
      return server.onWrite(url, init, JSON.parse(init.body));
    }
    if (url.startsWith("/api/care-access/grants")) {
      return reply(
        server.editAccess === undefined
          ? { grants: server.grants }
          : { grants: server.grants, editAccessAvailable: server.editAccess },
      );
    }
    if (url.startsWith("/api/care-access/vets")) return reply({ available: true, vets: url.endsWith("q=") ? [] : server.found });
    if (url.startsWith("/api/care-access/offers")) return reply({ available: true, offers: server.offers });
    if (url.startsWith("/api/care-access/links")) return reply({ available: true, links: [] });
    return reply({ invites: [] });
  });
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => {
  client?.clear();
  jest.restoreAllMocks();
});

async function open(props) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const onClose = jest.fn();
  const s = render(
    <QueryClientProvider client={client}>
      <ShareWithVetSheet pet={{ id: 7, name: "Luna" }} onClose={onClose} onOpenRequests={jest.fn()} {...props} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(client.isFetching()).toBe(0));
  return Object.assign(s, { onClose });
}
const press = (s, id) => fireEvent.press(s.getByTestId(id));
const state = (s, id) => s.getByTestId(id).props.accessibilityState;
const ctaDisabled = (s) => state(s, "cta").disabled;
const alerted = () => waitFor(() => expect(Alert.alert).toHaveBeenCalled());

describe("a vet the owner already shares with", () => {
  test("is in the picker without any booking, apart from the booked ones", async () => {
    const s = await open();
    expect(s.getByText("Currently sharing with")).toBeTruthy();
    expect(s.getByText("Palermo Vets")).toBeTruthy();
    expect(s.getByTestId("vet-share-vet-9")).toBeTruthy();
    expect(s.getByText("Vets you've booked")).toBeTruthy();
    expect(s.getByTestId("vet-share-vet-3")).toBeTruthy();
  });

  test("is listed once when it is also booked", async () => {
    server.grants = [shared({ provider_id: 3, provider_name: "North Clinic" })];
    const s = await open();
    expect(s.getAllByTestId("vet-share-vet-3")).toHaveLength(1);
    expect(s.queryByText("Vets you've booked")).toBeNull();
  });

  test("is found by search too, says it has access, and choosing it there edits that share", async () => {
    server.found = [{ id: 9, name: "Palermo Vets", handle: "palermo" }];
    const s = await open();
    fireEvent.changeText(s.getByTestId("vet-search-input"), "palermo");
    await waitFor(() => expect(s.getByTestId("vet-search-result-9")).toBeTruthy(), { timeout: 3000 });
    expect(within(s.getByTestId("vet-search-result-9")).getByText(/Has access now/)).toBeTruthy();
    press(s, "vet-search-result-9");
    expect(s.getByTestId("vet-share-edit-note")).toBeTruthy();
    expect(state(s, "vet-share-section-vaccines").checked).toBe(true);
    expect(s.getByText("Review changes")).toBeTruthy();
  });

  test("starts as the share is now, keeping its end date, with nothing to save yet", async () => {
    const s = await open();
    press(s, "vet-share-vet-9");
    for (const [key, on] of [["vet_notes", true], ["vaccines", true], ["files", false], ["profile", false]]) {
      expect(state(s, `vet-share-section-${key}`).checked).toBe(on);
    }
    expect(state(s, "vet-share-add-vet_notes").checked).toBe(true);
    expect(state(s, "vet-share-add-vaccines").checked).toBe(false);
    expect(state(s, "vet-share-expiry-keep").selected).toBe(true);
    expect(s.getByText(/^Keep current end date \(/)).toBeTruthy();
    expect(s.getByText("Nothing changed yet.")).toBeTruthy();
    expect(ctaDisabled(s)).toBe(true);
  });

  test("saving changes that same share, and nothing else is sent", async () => {
    server.onWrite = (_url, _init, body) => {
      server.grants = [shared({ sections: body.sections, edit_sections: body.editSections })];
      return reply({ grant: server.grants[0] });
    };
    const s = await open();
    press(s, "vet-share-vet-9");
    press(s, "vet-share-add-files");
    press(s, "cta");

    expect(within(s.getByTestId("vet-share-review-add")).getByText("Documents")).toBeTruthy();
    expect(within(s.getByTestId("vet-share-review-add")).getByText("Vet notes, and edit the ones added this way")).toBeTruthy();
    expect(s.getByText("They can't delete anything.")).toBeTruthy();
    expect(s.getByText("Can see about Luna:")).toBeTruthy();
    expect(s.getByText(/I also agree that they can add to: Vet notes, Documents\./)).toBeTruthy();
    expect(ctaDisabled(s)).toBe(true);
    press(s, "vet-share-consent");
    expect(s.getByText("Save changes")).toBeTruthy();
    press(s, "cta");
    await alerted();

    expect(server.writes).toEqual([
      ["/api/care-access/grants/4", "PATCH", {
        action: "update",
        sections: ["vet_notes", "vaccines", "files"],
        editSections: ["vet_notes", "files"],
        expiry: "keep",
      }],
    ]);
    expect(Alert.alert.mock.calls[0][0]).toBe("Access updated");
    expect(Alert.alert.mock.calls[0][1]).toMatch(/They can also add to: Vet notes, Documents\.$/);
    // The vet is still there, with what it has now.
    await waitFor(() => expect(s.getByTestId("grant-adds-4")).toBeTruthy());
    expect(s.getByText("Currently sharing with")).toBeTruthy();
    expect(within(s.getByTestId("grant-adds-4")).getByText("Documents")).toBeTruthy();
  });

  test("a new length is sent as chosen", async () => {
    server.onWrite = () => reply({ grant: shared({ expires_at: new Date(Date.now() + 365 * DAY).toISOString() }) });
    const s = await open();
    for (const id of ["vet-share-vet-9", "vet-share-expiry-1y", "cta", "vet-share-consent", "cta"]) press(s, id);
    await alerted();
    expect(server.writes[0][2]).toMatchObject({ action: "update", expiry: "1y", editSections: ["vet_notes"] });
    expect(Alert.alert.mock.calls[0][0]).toBe("Access updated");
  });

  test.each([
    ["other parts", { sections: ["vet_notes", "vaccines", "insurance"] }],
    ["more to add", { edit_sections: ["vet_notes", "vaccines"] }],
    ["another end date", { expires_at: null }],
    ["another grant", { id: 5 }],
  ])("an answer with %s than chosen is not reported as saved, and revoke is offered", async (_name, over) => {
    server.onWrite = () => reply({ grant: shared({ sections: ["vet_notes"], ...over }) });
    const s = await open();
    for (const id of ["vet-share-vet-9", "vet-share-section-vaccines", "cta", "vet-share-consent", "cta"]) press(s, id);
    await alerted();
    expect(Alert.alert.mock.calls[0][0]).toBe("Check this access");
    expect(Alert.alert.mock.calls[0][2].map((b) => b.text)).toEqual(["Later", "Revoke access"]);
    expect(server.writes).toHaveLength(1);
  });

  test.each([
    [409, "grant_not_editable", /older access can't be edited/],
    [409, "grant_not_active", /has ended, so nothing changed/],
    [409, "edit_access_unavailable", /isn't available yet\. Nothing changed/],
    [404, undefined, /no longer there/],
    [429, undefined, /too many tries/],
    [400, undefined, /wasn't accepted, so nothing changed/],
    [500, undefined, /couldn't confirm the result/],
  ])("a %i %s refusal to save says why, and nothing is revoked or shared again", async (status, code, message) => {
    server.onWrite = () => reply({ code }, status);
    const s = await open();
    for (const id of ["vet-share-vet-9", "vet-share-add-vaccines", "cta", "vet-share-consent", "cta"]) press(s, id);
    await alerted();
    expect(Alert.alert.mock.calls[0][0]).toBe("Couldn't save the changes");
    expect(Alert.alert.mock.calls[0][1]).toMatch(message);
    expect(server.writes).toHaveLength(1);
    // Back at the choices, which are still there.
    expect(state(s, "vet-share-add-vaccines").checked).toBe(true);
  });

  test("opened for that vet (a booking, or Edit access): edits it and closes once saved", async () => {
    server.onWrite = () => reply({ grant: shared({ edit_sections: [] }) });
    const s = await open({ provider: { providerId: 9, name: "Palermo Vets" } });
    expect(s.getByTestId("sheet-title").props.children).toBe("Edit access");
    expect(s.queryByTestId("vet-share-change")).toBeNull();
    expect(s.getByTestId("vet-share-revoke-4")).toBeTruthy();
    for (const id of ["vet-share-add-vet_notes", "cta"]) press(s, id);
    expect(s.getByText("View only: they can't add anything.")).toBeTruthy();
    press(s, "vet-share-consent");
    press(s, "cta");
    await alerted();
    expect(server.writes[0][2]).toMatchObject({ action: "update", editSections: [], expiry: "keep" });
    expect(s.onClose).toHaveBeenCalledTimes(1);
  });

  test("an access with no end date is kept as 'until I revoke it', offered once", async () => {
    server.grants = [shared({ expires_at: null })];
    const s = await open();
    press(s, "vet-share-vet-9");
    expect(s.getByText("Keep: until I revoke it")).toBeTruthy();
    expect(s.queryByTestId("vet-share-expiry-until_revoked")).toBeNull();
    expect(s.getByTestId("vet-share-expiry-30d")).toBeTruthy();
  });

  test("opened for one business, another one's access is listed with revoke only", async () => {
    const s = await open({ provider: { providerId: 3, name: "North Clinic" } });
    expect(s.getByText("Palermo Vets")).toBeTruthy();
    expect(s.getByTestId("vet-share-revoke-4")).toBeTruthy();
    expect(s.queryByTestId("vet-share-vet-9")).toBeNull();
    expect(s.queryByTestId("vet-share-edit-4")).toBeNull();
  });

  test("a change made elsewhere while choosing starts the choices again and clears consent", async () => {
    const s = await open();
    for (const id of ["vet-share-vet-9", "vet-share-section-files", "cta", "vet-share-consent"]) press(s, id);
    server.grants = [shared({ sections: ["insurance"], edit_sections: [] })];
    await act(async () => { await client.invalidateQueries({ queryKey: ["care-access-grants"] }); });
    await waitFor(() => expect(state(s, "vet-share-section-insurance").checked).toBe(true));
    expect(state(s, "vet-share-section-files").checked).toBe(false);
    expect(s.queryByTestId("vet-share-review")).toBeNull();
  });

  test("an older grant is not edited: choosing the parts replaces it, as before", async () => {
    server.grants = [shared({ sections: null, scopes: ["medical_read"], edit_sections: [] })];
    server.onWrite = (_url, _init, body) => reply({ grant: shared({ id: 6, sections: body.sections, edit_sections: [], expires_at: null }) }, 201);
    const s = await open();
    expect(s.getByText("Choose what to share")).toBeTruthy();
    press(s, "vet-share-vet-9");
    expect(s.getByTestId("vet-share-replace-note")).toBeTruthy();
    expect(s.queryByTestId("vet-share-expiry-keep")).toBeNull();
    for (const id of ["vet-share-section-vaccines", "vet-share-expiry-until_revoked", "cta", "vet-share-consent", "cta"]) press(s, id);
    await alerted();
    expect(server.writes).toEqual([
      ["/api/care-access/grants", "POST", { petId: 7, providerId: 9, sections: ["vaccines"], expiry: "until_revoked", editSections: [] }],
    ]);
  });
});

describe("a new vet", () => {
  test("shared with the chosen additions, then listed under 'Currently sharing with'", async () => {
    server.grants = [];
    server.onWrite = (_url, _init, body) => {
      const grant = shared({
        id: 8, provider_id: 3, provider_name: undefined, sections: body.sections, edit_sections: body.editSections,
        granted_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * DAY).toISOString(),
      });
      server.grants = [{ ...grant, provider_name: "North Clinic" }];
      return reply({ grant }, 201);
    };
    const s = await open();
    press(s, "vet-share-vet-3");
    for (const key of ["vet_notes", "vaccines", "files", "lab_results"]) {
      expect(state(s, `vet-share-add-${key}`).checked).toBe(false);
    }
    for (const id of ["vet-share-add-vaccines", "vet-share-expiry-7d", "cta"]) press(s, id);
    expect(s.getByText(/I also agree that they can add to: Vaccinations\./)).toBeTruthy();
    press(s, "vet-share-consent");
    press(s, "cta");
    await alerted();
    expect(server.writes).toEqual([
      ["/api/care-access/grants", "POST", { petId: 7, providerId: 3, sections: ["vaccines"], expiry: "7d", editSections: ["vaccines"] }],
    ]);
    expect(Alert.alert.mock.calls[0][0]).toBe("Access given");
    await waitFor(() => expect(s.getByText("Currently sharing with")).toBeTruthy());
    expect(s.getByTestId("vet-share-vet-3")).toBeTruthy();
  });

  test("adding implies seeing, and a part no longer seen can no longer be added to", async () => {
    server.grants = [];
    const s = await open();
    press(s, "vet-share-vet-3");
    press(s, "vet-share-add-vet_notes");
    expect(state(s, "vet-share-section-vet_notes").checked).toBe(true);
    press(s, "vet-share-section-vet_notes");
    expect(state(s, "vet-share-add-vet_notes").checked).toBe(false);
  });

  test("a grant that came back allowing more than chosen is revoked", async () => {
    server.grants = [];
    server.onWrite = (url) =>
      reply(
        { grant: shared({ id: 8, provider_id: 3, sections: ["vaccines"], edit_sections: ["vaccines"], expires_at: null, status: url.endsWith("/8") ? "revoked" : "active" }) },
        201,
      );
    const s = await open();
    for (const id of ["vet-share-vet-3", "vet-share-section-vaccines", "vet-share-expiry-until_revoked", "cta", "vet-share-consent", "cta"]) press(s, id);
    await alerted();
    expect(server.writes[1]).toEqual(["/api/care-access/grants/8", "PATCH", { action: "revoke" }]);
  });

  test("an invitation says what could be added and sends it", async () => {
    server.grants = [];
    server.found = [{ id: 12, name: "South Clinic", handle: "south" }];
    server.onWrite = (_url, _init, body) =>
      reply({ offer: { id: 51, pet_id: 7, provider_id: 12, sections: body.sections, edit_sections: body.editSections, expiry: body.expiry, status: "open", lapses_at: new Date(Date.now() + 5 * DAY).toISOString() } }, 201);
    const s = await open();
    fireEvent.changeText(s.getByTestId("vet-search-input"), "south");
    await waitFor(() => expect(s.getByTestId("vet-search-result-12")).toBeTruthy(), { timeout: 3000 });
    for (const id of ["vet-search-result-12", "vet-share-add-lab_results", "vet-share-expiry-30d", "cta"]) press(s, id);
    expect(s.getByText("Will be able to see about Luna:")).toBeTruthy();
    expect(within(s.getByTestId("vet-share-review-add")).getByText("Lab results")).toBeTruthy();
    press(s, "vet-share-consent");
    press(s, "cta");
    await alerted();
    expect(server.writes[0][2]).toEqual({ petId: 7, providerId: 12, sections: ["lab_results"], expiry: "30d", editSections: ["lab_results"] });
    expect(Alert.alert.mock.calls[0][0]).toBe("Invitation sent");
  });
});

describe.each([
  ["a server from before edit permission", undefined],
  ["a database that cannot store it", false],
])("%s", (_name, editAccess) => {
  test("shows no edit control and no 'Can add', and shares as before", async () => {
    server.editAccess = editAccess;
    server.grants = [shared({ edit_sections: [] })];
    server.onWrite = () => reply({ grant: shared({ sections: ["files"], edit_sections: undefined, expires_at: null }) }, 201);
    const s = await open();
    expect(s.queryByText("Edit access")).toBeNull();
    press(s, "vet-share-vet-9");
    expect(s.queryByTestId("vet-share-add-vaccines")).toBeNull();
    expect(s.queryByTestId("vet-share-expiry-keep")).toBeNull();
    expect(s.getByTestId("vet-share-replace-note")).toBeTruthy();
    for (const id of ["vet-share-section-files", "vet-share-expiry-until_revoked", "cta"]) press(s, id);
    expect(s.queryByTestId("vet-share-review-add")).toBeNull();
    expect(s.getByText("Can see about Luna (read only):")).toBeTruthy();
    press(s, "vet-share-consent");
    press(s, "cta");
    await alerted();
    expect(server.writes).toEqual([
      ["/api/care-access/grants", "POST", { petId: 7, providerId: 9, sections: ["files"], expiry: "until_revoked" }],
    ]);
  });
});

test("Spanish (voseo)", async () => {
  mockLangRef.current = "es";
  const s = await open();
  expect(s.getByText("Compartís con")).toBeTruthy();
  press(s, "vet-share-vet-9");
  expect(s.getAllByText("Puede agregar").length).toBeGreaterThan(0);
  expect(s.getByText(/^Dejar la fecha actual \(/)).toBeTruthy();
  press(s, "vet-share-add-vaccines");
  press(s, "cta");
  expect(s.getByText("Va a poder agregar:")).toBeTruthy();
  expect(s.getByText(/También acepto que pueda agregar en: Notas veterinarias, Vacunas\./)).toBeTruthy();
  expect(s.getByText("Guardar cambios")).toBeTruthy();
});

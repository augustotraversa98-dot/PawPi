// Roadmap N4 — the Sex/Gender selector never showed the stored value as
// pre-selected because it rendered options as ["Male","Female"] (capitalized)
// while `pets.gender` is stored lowercase (the app-wide convention — see
// profile-edit.jsx / AddDogModal.jsx / onboarding.jsx). Options are now lowercase
// ("male"/"female", capitalized only for display) and the initial value is
// lower-cased on read, so a differently-cased legacy value still matches.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("@/components/DateField", () => () => null);

import EditMedicalProfileModal from "./EditMedicalProfileModal";
import { COLORS } from "@/constants/theme";

function isSelected(api, testID) {
  const style = StyleSheet.flatten(api.getByTestId(testID).props.style);
  return style.backgroundColor === COLORS.coral;
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderWithClient(ui, queryClient = makeClient()) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    ),
  };
}

describe("EditMedicalProfileModal — Sex/Gender selector", () => {
  it("pre-selects the stored (lowercase) gender on open", () => {
    const api = renderWithClient(
      <EditMedicalProfileModal
        visible
        petId={1}
        initialData={{ pet: { gender: "female" } }}
        onClose={jest.fn()}
      />,
    );
    expect(isSelected(api, "gender-female")).toBe(true);
    expect(isSelected(api, "gender-male")).toBe(false);
  });

  it("still pre-selects correctly when the stored value has legacy capitalization", () => {
    // Simulates a row saved before this fix (this modal used to write "Male"/"Female").
    const api = renderWithClient(
      <EditMedicalProfileModal
        visible
        petId={1}
        initialData={{ pet: { gender: "Male" } }}
        onClose={jest.fn()}
      />,
    );
    expect(isSelected(api, "gender-male")).toBe(true);
    expect(isSelected(api, "gender-female")).toBe(false);
  });

  it("shows neither option selected when no gender is stored yet", () => {
    const api = renderWithClient(
      <EditMedicalProfileModal
        visible
        petId={1}
        initialData={{ pet: {} }}
        onClose={jest.fn()}
      />,
    );
    expect(isSelected(api, "gender-male")).toBe(false);
    expect(isSelected(api, "gender-female")).toBe(false);
  });
});

describe("EditMedicalProfileModal — cache invalidation on save", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("invalidates the [\"pets\"] query on a successful save, so Dog Profile/Dog Social Profile refetch immediately", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    jest.spyOn(require("react-native").Alert, "alert").mockImplementation(() => {});

    const { queryClient, getByText } = renderWithClient(
      <EditMedicalProfileModal
        visible
        petId={1}
        initialData={{ pet: { gender: "female", breed: "Beagle" } }}
        onClose={jest.fn()}
        onSave={jest.fn()}
      />,
    );
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    fireEvent.press(getByText("editMedicalProfile.saveCta"));

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["pets"] });
    });
  });

  it("does NOT invalidate the pets cache when the save fails", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    jest.spyOn(require("react-native").Alert, "alert").mockImplementation(() => {});

    const { queryClient, getByText } = renderWithClient(
      <EditMedicalProfileModal
        visible
        petId={1}
        initialData={{ pet: { gender: "female" } }}
        onClose={jest.fn()}
      />,
    );
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    fireEvent.press(getByText("editMedicalProfile.saveCta"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

// N11 — the missing estimated-age fields (docs/roadmap.md). Ticket: this modal
// could edit birthday but had NO age_years/age_months fields at all, so a pet
// whose profile only ever had a birthday set through Vet Record had no way to
// ever get an age estimate. BirthdayOrAgeField (shared with profile-edit.jsx)
// fixes that with an explicit "known birthday" vs "I'm not sure" toggle.
describe("EditMedicalProfileModal — birthday vs. estimated age", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function requestBody() {
    return JSON.parse(global.fetch.mock.calls[0][1].body);
  }

  it("defaults to 'I'm not sure' (estimate fields) when the pet has no birthday yet", () => {
    const api = renderWithClient(
      <EditMedicalProfileModal
        visible
        petId={1}
        initialData={{ pet: {} }}
        onClose={jest.fn()}
      />,
    );
    expect(isSelected(api, "birthday-unsure")).toBe(true);
    expect(isSelected(api, "birthday-known")).toBe(false);
    expect(api.getByTestId("estimated-age-years")).toBeTruthy();
  });

  it("defaults to 'I know the birthday' when the pet already has one stored", () => {
    const api = renderWithClient(
      <EditMedicalProfileModal
        visible
        petId={1}
        initialData={{ pet: { birthday: "2020-01-01" } }}
        onClose={jest.fn()}
      />,
    );
    expect(isSelected(api, "birthday-known")).toBe(true);
    expect(isSelected(api, "birthday-unsure")).toBe(false);
  });

  it("sends the typed estimate and clears birthday when saving in 'I'm not sure' mode", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    jest.spyOn(require("react-native").Alert, "alert").mockImplementation(() => {});

    const api = renderWithClient(
      <EditMedicalProfileModal
        visible
        petId={1}
        initialData={{ pet: { birthday: "2020-01-01" } }}
        onClose={jest.fn()}
      />,
    );

    // Switch into estimate mode, then type an estimate.
    fireEvent.press(api.getByTestId("birthday-unsure"));
    fireEvent.changeText(api.getByTestId("estimated-age-years"), "4");
    fireEvent.changeText(api.getByTestId("estimated-age-months"), "2");
    fireEvent.press(api.getByText("editMedicalProfile.saveCta"));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = requestBody();
    expect(body.birthday).toBeNull();
    expect(body.ageYears).toBe(4);
    expect(body.ageMonths).toBe(2);
  });

  it("omits ageYears/ageMonths from the save body when the birthday is known (leaves any old estimate in place)", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    jest.spyOn(require("react-native").Alert, "alert").mockImplementation(() => {});

    const api = renderWithClient(
      <EditMedicalProfileModal
        visible
        petId={1}
        initialData={{ pet: { age_years: 3, age_months: 6 } }}
        onClose={jest.fn()}
      />,
    );

    // Switch into "known birthday" mode (default here is "unsure" — no
    // birthday stored yet) without typing a birthday; the point is that a
    // previously-stored estimate must survive being left un-submitted.
    fireEvent.press(api.getByTestId("birthday-known"));
    fireEvent.press(api.getByText("editMedicalProfile.saveCta"));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = requestBody();
    expect(body).not.toHaveProperty("ageYears");
    expect(body).not.toHaveProperty("ageMonths");
  });
});

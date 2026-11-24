// Family sharing (PR5a): the Health tab by role. The vet record (documents, labs, surgeries, vaccines, appointments) is closed to a caregiver by
// the server, so the app shows a friendly "only for the owner and family" card instead of firing requests that would 403. EN + ES.
import React from "react";
import { render } from "@testing-library/react-native";

let mockParams = {};
let mockPet;
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-i18next", () => ({
  useTranslation: () => require("@/i18n/testMock").makeReactI18nextMock(global.__lang || "en").useTranslation(),
}));
jest.mock("@/hooks/usePetProfile", () => ({ useCurrentPet: () => ({ data: mockPet, isLoading: false }) }));
jest.mock("@/components/Pets/PetSwitcher", () => ({ PetSwitcher: () => null }));
jest.mock("@/components/ui", () => {
  const { View } = require("react-native");
  return { GlassSurface: ({ children }) => <View>{children}</View>, PressableScale: ({ children }) => <View>{children}</View> };
});
const Stub = (label) => {
  const { Text } = require("react-native");
  return () => <Text>{label}</Text>;
};
jest.mock("../../components/Health/HealthToday", () => Stub("TODAY_SECTION"));
jest.mock("../../components/Health/HealthTrack", () => Stub("TRACK_SECTION"));
jest.mock("../../components/Health/HealthInsights", () => Stub("INSIGHTS_SECTION"));
jest.mock("../../components/Health/HealthVetRecord", () => Stub("VET_RECORD_SECTION"));

import HealthScreen from "./health";

const owner = { id: 1, name: "Mango", is_shared: false, access_role: "owner" };
const family = { id: 7, name: "Luna", is_shared: true, access_role: "family" };
const caregiver = { id: 7, name: "Luna", is_shared: true, access_role: "caregiver" };

const W = {
  en: { title: "Only for family and the owner", body: "As a caregiver you can see Luna's routines and log walks, meals and care." },
  es: { title: "Solo para la familia y el dueño", body: "Como cuidador podés ver las rutinas de Luna y registrar paseos, comidas y cuidados." },
};

describe.each(["en", "es"])("Health tab vet-record section by role (%s)", (lang) => {
  beforeEach(() => {
    global.__lang = lang;
    mockParams = { section: "vet-record" };
  });
  afterAll(() => {
    delete global.__lang;
  });

  test.each([
    ["owner", owner],
    ["family", family],
  ])("%s opens the vet record", (_n, pet) => {
    mockPet = pet;
    const { getByText, queryByTestId } = render(<HealthScreen />);
    expect(getByText("VET_RECORD_SECTION")).toBeTruthy();
    expect(queryByTestId("vet-record-locked")).toBeNull();
  });

  test("caregiver gets the friendly locked card, NOT the vet record (no requests are made)", () => {
    mockPet = caregiver;
    const { getByTestId, getByText, queryByText } = render(<HealthScreen />);
    expect(getByTestId("vet-record-locked")).toBeTruthy();
    expect(getByText(W[lang].title)).toBeTruthy();
    expect(getByText(new RegExp(W[lang].body))).toBeTruthy();
    expect(queryByText("VET_RECORD_SECTION")).toBeNull();
  });

  test("the caregiver still reaches Today (logging and completing is theirs)", () => {
    mockPet = caregiver;
    mockParams = {};
    const { getByText } = render(<HealthScreen />);
    expect(getByText("TODAY_SECTION")).toBeTruthy();
  });

  test("no dog resolved yet: the section is not replaced by a lock (loading never flashes a lock)", () => {
    mockPet = null;
    const { getByText, queryByTestId } = render(<HealthScreen />);
    expect(getByText("VET_RECORD_SECTION")).toBeTruthy();
    expect(queryByTestId("vet-record-locked")).toBeNull();
  });
});

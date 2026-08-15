// PP2 sweep — Search & Discover was 100% hardcoded English (title, placeholder,
// every section header, both empty states) even though `search.title` /
// `search.noResults` / `search.nothingHere` had been sitting unused in the
// catalog. Same screen, Spanish catalog.

import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";

let mockDiscover;
let mockSearch;

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock("es"),
);
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return { Image: (props) => <View {...props} /> };
});
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/hooks/useSearch", () => ({
  useDebouncedValue: (v) => v,
  useSearch: () => mockSearch,
}));
jest.mock("@/hooks/useDiscover", () => ({
  useDiscover: () => mockDiscover,
}));

import SearchScreen from "./search";

beforeEach(() => {
  mockDiscover = { data: { profiles: [], moments: [] }, isLoading: false };
  mockSearch = { data: { pets: [], owners: [], providers: [] }, isLoading: false };
});

it("renders the header, input and empty state in Spanish", () => {
  const { getByText, getByPlaceholderText, getByLabelText } = render(
    <SearchScreen />,
  );
  expect(getByText("Buscar y descubrir")).toBeTruthy();
  expect(getByPlaceholderText("Buscá mascotas, razas, dueños o negocios…")).toBeTruthy();
  expect(getByLabelText("Atrás")).toBeTruthy();
  expect(getByText("Todavía no hay nada por aquí")).toBeTruthy();
});

it("renders the discover section headers in Spanish", () => {
  mockDiscover = {
    data: {
      profiles: [{ id: 1, name: "Cooper", breed: "Golden", owner_name: "Mike" }],
      moments: [{ id: 5, pet_id: 2, image_url: "x", pet_name: "Bella" }],
    },
    isLoading: false,
  };
  const { getByText } = render(<SearchScreen />);
  expect(getByText("PERFILES POPULARES")).toBeTruthy();
  expect(getByText("MOMENTOS POPULARES")).toBeTruthy();
  // The owner byline is interpolated, not concatenated with an English "by".
  expect(getByText("Golden • de Mike")).toBeTruthy();
});

it("renders the result section headers and no-results state in Spanish", async () => {
  mockSearch = {
    data: {
      pets: [{ id: 1, name: "Rex", breed: "Lab" }],
      owners: [{ id: 2, full_name: "Ana", username: "ana" }],
      providers: [{ id: 9, slug: "happy-paws", name: "Happy Paws" }],
    },
    isLoading: false,
  };
  const { getByPlaceholderText, getByText } = render(<SearchScreen />);
  await act(async () => {
    fireEvent.changeText(
      getByPlaceholderText("Buscá mascotas, razas, dueños o negocios…"),
      "re",
    );
  });
  expect(getByText("MASCOTAS")).toBeTruthy();
  expect(getByText("NEGOCIOS")).toBeTruthy();
  expect(getByText("DUEÑOS")).toBeTruthy();

  mockSearch = { data: { pets: [], owners: [], providers: [] }, isLoading: false };
  const empty = render(<SearchScreen />);
  await act(async () => {
    fireEvent.changeText(
      empty.getByPlaceholderText("Buscá mascotas, razas, dueños o negocios…"),
      "zzz",
    );
  });
  expect(empty.getByText("Sin resultados")).toBeTruthy();
  expect(empty.getByText("Probá con otra búsqueda")).toBeTruthy();
});

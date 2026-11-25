// Who logged a history entry (migration 0144): public name, "Former member" translated, nothing when unknown. EN + ES.
import React from "react";
import { render } from "@testing-library/react-native";
import i18n from "@/i18n";
import LoggedByLine from "./LoggedByLine";
import { groupPhotoChecksByArea } from "./PhotoCheck/PhotoHistory";

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("@/components/ui/PrivateImage", () => () => null);
jest.mock("@/hooks/useFetchHealthData", () => ({ usePhotoChecks: () => ({ data: { photoChecks: [] } }) }));

beforeEach(() => i18n.changeLanguage("en"));

test("shows the logger's name", () => {
  expect(render(<LoggedByLine name="Sam Rivera" />).getByText("Logged by Sam Rivera")).toBeTruthy();
});

test("a deleted account reads Former member, in the person's language", async () => {
  expect(render(<LoggedByLine name="Former member" />).getByText("Logged by Former member")).toBeTruthy();
  await i18n.changeLanguage("es");
  expect(render(<LoggedByLine name="Former member" />).getByText("Registrado por Ex integrante")).toBeTruthy();
});

test.each([undefined, null, "", "   "])("no author (%p): nothing at all", (name) => {
  expect(render(<LoggedByLine name={name} />).toJSON()).toBeNull();
});

test("the photo history keeps the name from the row", () => {
  const grouped = groupPhotoChecksByArea([
    { id: 1, body_area: "eyes", created_at: "2026-11-24T10:00:00Z", logged_by_name: "Sam" },
    { id: 2, body_area: "eyes", created_at: "2026-11-23T10:00:00Z" },
  ]);
  expect(grouped.eyes.map((p) => p.loggedByName)).toEqual(["Sam", null]);
});

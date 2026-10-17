import { Alert } from "react-native";

const mockT = jest.fn();
jest.mock("react-i18next", () => ({ getI18n: () => ({ t: mockT }) }));

import {
  isTechnicalMessage,
  friendlyErrorMessage,
  alertError,
  alertText,
  translate,
} from "./appAlert";

beforeEach(() => {
  mockT.mockReset();
  mockT.mockImplementation((k) => `T(${k})`);
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("appAlert", () => {
  test("technical/plumbing messages are recognised", () => {
    for (const m of [
      "Network request failed",
      "JSON Parse error: Unexpected character",
      "Upload failed: 500 Internal Server Error",
      "TypeError: undefined is not an object",
      "Aborted",
      "",
      undefined,
    ]) {
      expect(isTechnicalMessage(m)).toBe(true);
    }
    expect(isTechnicalMessage("That handle was just taken. Pick another one.")).toBe(false);
  });

  test("a server's friendly sentence is kept, a technical one becomes the localized fallback", () => {
    expect(friendlyErrorMessage(new Error("You already have a pack streak with this friend"), "appAlerts.couldNotInvite")).toBe(
      "You already have a pack streak with this friend",
    );
    expect(friendlyErrorMessage(new Error("Network request failed"), "appAlerts.couldNotInvite")).toBe(
      "T(appAlerts.couldNotInvite)",
    );
    expect(friendlyErrorMessage(null)).toBe("T(common.somethingWrong)");
  });

  test("alertError uses the localized 'Error' title and never leaks raw text", () => {
    alertError(new Error("Network request failed"), "appAlerts.couldNotPost");
    expect(Alert.alert).toHaveBeenCalledWith("T(common.error)", "T(appAlerts.couldNotPost)");
  });

  test("alertText resolves both keys", () => {
    alertText("appAlerts.inviteSentTitle", "appAlerts.inviteSentBody");
    expect(Alert.alert).toHaveBeenCalledWith("T(appAlerts.inviteSentTitle)", "T(appAlerts.inviteSentBody)");
  });

  test("translate falls back when i18n returns the key itself or throws", () => {
    mockT.mockImplementation((k) => k);
    expect(translate("x.y", "Fallback")).toBe("Fallback");
    mockT.mockImplementation(() => {
      throw new Error("not init");
    });
    expect(translate("x.y", "Fallback")).toBe("Fallback");
  });
});

import { Appearance } from "react-native";
import {
  iosMajorVersion,
  legacyTabBarBlur,
  forceLightAppearance,
} from "./tabBarGlass";

describe("tabBarGlass", () => {
  test("iosMajorVersion parses string and number versions, 0 off iOS", () => {
    expect(iosMajorVersion("26.0", "ios")).toBe(26);
    expect(iosMajorVersion(18, "ios")).toBe(18);
    expect(iosMajorVersion("17.5.1", "ios")).toBe(17);
    expect(iosMajorVersion("abc", "ios")).toBe(0);
    expect(iosMajorVersion(34, "android")).toBe(0);
  });

  test("legacyTabBarBlur never overrides the iOS 26 Liquid Glass", () => {
    expect(legacyTabBarBlur("26.0", "ios")).toBeUndefined();
    expect(legacyTabBarBlur("27.1", "ios")).toBeUndefined();
  });

  test("legacyTabBarBlur gives iOS < 26 a light translucent material", () => {
    expect(legacyTabBarBlur("18.2", "ios")).toBe(
      "systemUltraThinMaterialLight",
    );
    expect(legacyTabBarBlur(17, "ios")).toBe("systemUltraThinMaterialLight");
  });

  test("legacyTabBarBlur is undefined for unknown version or Android", () => {
    expect(legacyTabBarBlur(undefined, "ios")).toBeUndefined();
    expect(legacyTabBarBlur("18.0", "android")).toBeUndefined();
  });

  test("forceLightAppearance pins light on iOS only and never throws", () => {
    const spy = jest.spyOn(Appearance, "setColorScheme").mockImplementation();
    expect(forceLightAppearance("ios")).toBe(true);
    expect(spy).toHaveBeenCalledWith("light");
    spy.mockClear();
    expect(forceLightAppearance("android")).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    spy.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(forceLightAppearance("ios")).toBe(false);
    spy.mockRestore();
  });
});

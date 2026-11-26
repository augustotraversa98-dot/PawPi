// The permission to send Vet Record documents to Anthropic: per-user storage, removed with the account data, EN/ES copy, and a guard
// that no second code path can ask the server to read a document without going through the gate in AddDocumentModal.
import fs from "fs";
import path from "path";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  aiDocConsentKey,
  getAiDocConsent,
  setAiDocConsent,
  subscribeAiDocConsent,
} from "./aiDocConsent";
import { isAccountKey } from "./accountStorage";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";

beforeEach(async () => {
  jest.restoreAllMocks();
  await AsyncStorage.clear();
});

describe("stored choice", () => {
  it("starts unknown", async () => {
    expect(await getAiDocConsent(7)).toBeNull();
  });

  it("is kept per user", async () => {
    await setAiDocConsent(7, true);
    await setAiDocConsent(8, false);
    expect(await getAiDocConsent(7)).toBe("granted");
    expect(await getAiDocConsent(8)).toBe("denied");
    expect(await getAiDocConsent(9)).toBeNull();
    expect(aiDocConsentKey(7)).not.toBe(aiDocConsentKey(8));
  });

  it("can be revoked", async () => {
    await setAiDocConsent(7, true);
    await setAiDocConsent(7, false);
    expect(await getAiDocConsent(7)).toBe("denied");
  });

  it("without a signed-in user nothing is stored or granted", async () => {
    expect(await setAiDocConsent(undefined, true)).toBe(false);
    expect(await getAiDocConsent(undefined)).toBeNull();
    expect(await getAiDocConsent(null)).toBeNull();
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });

  it("an unreadable or unexpected value is not permission", async () => {
    await AsyncStorage.setItem(aiDocConsentKey(7), "true");
    expect(await getAiDocConsent(7)).toBeNull();
    jest.spyOn(AsyncStorage, "getItem").mockRejectedValueOnce(new Error("disk"));
    expect(await getAiDocConsent(7)).toBeNull();
  });

  it("reports a failed save and tells nobody", async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeAiDocConsent(listener);
    jest.spyOn(AsyncStorage, "setItem").mockRejectedValueOnce(new Error("disk"));
    expect(await setAiDocConsent(7, true)).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("notifies subscribers until they unsubscribe", async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeAiDocConsent(listener);
    await setAiDocConsent(7, true);
    expect(listener).toHaveBeenCalledWith(7, "granted");
    unsubscribe();
    await setAiDocConsent(7, false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("is account data: sign-out and account deletion remove it", () => {
    expect(isAccountKey(aiDocConsentKey(7))).toBe(true);
  });
});

describe("only one path can ask the server to read a document", () => {
  const SRC = path.join(__dirname, "..");
  function* files(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) yield* files(path.join(dir, e.name));
      else if (/\.(js|jsx|ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) yield path.join(dir, e.name);
    }
  }

  it("is AddDocumentModal (telemetry only lists the route name)", () => {
    const users = [...files(SRC)]
      .filter((f) => fs.readFileSync(f, "utf8").includes("documents/extract"))
      .map((f) => path.relative(SRC, f).split(path.sep).join("/"))
      .sort();
    // Adding a caller? It must ask utils/aiDocConsent first and send aiConsent: true.
    expect(users).toEqual([
      "components/Health/VetRecord/AddDocumentModal.jsx",
      "telemetry/apiRoutes.js",
    ]);
  });
});

describe("copy", () => {
  const blocks = (locale) => ({
    aiConsent: locale.health.vetRecord.aiConsent,
    addDoc: locale.health.vetRecord.addDoc,
  });

  it("EN and ES have the same keys, all translated", () => {
    for (const name of ["aiConsent", "addDoc"]) {
      expect(Object.keys(blocks(es)[name]).sort()).toEqual(Object.keys(blocks(en)[name]).sort());
    }
    for (const key of ["title", "body", "limits", "allow", "notNow"]) {
      expect(blocks(es).aiConsent[key]).not.toBe(blocks(en).aiConsent[key]);
    }
    for (const key of ["aiDocsTitle", "aiDocsHint", "aiDocsLearnMore", "aiDocsErrorTitle"]) {
      expect(es.settings[key]).toBeTruthy();
      expect(es.settings[key]).not.toBe(en.settings[key]);
    }
  });

  it("names the recipient and the permission, and never promises automatic reading", () => {
    for (const locale of [en, es]) {
      expect(locale.health.vetRecord.aiConsent.body).toContain("Anthropic");
      expect(locale.health.vetRecord.addDoc.aiReadNote).toContain("Anthropic");
      expect(locale.settings.aiDocsHint).toContain("Anthropic");
      // The "not read" status quotes the Settings switch by its exact name.
      expect(locale.health.vetRecord.addDoc.notRead).toContain(locale.settings.aiDocsTitle);
      expect(JSON.stringify(locale.health.vetRecord.addDoc)).not.toMatch(/automatic|automátic/i);
    }
  });
});

// GeneralCheckModal (Quick Check) — the per-area health walkthrough. This suite pins
// the on-device fix from the 2026-08-18 revision: the per-area status choice ("Looks
// usual" / "Something changed") is the required first action, so "Next" stays disabled
// (and shows a hint) until one is picked, then enables and advances. Also pins the full
// EN+ES localization of the modal (previously hardcoded English). The logging hook and
// native wrappers are mocked.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// KeyboardAwareScrollView is a native-backed wrapper; a plain ref-forwarding View is
// enough here (the modal only calls the optional scrollTo, guarded by ?.).
jest.mock("@/components/KeyboardAwareScrollView", () => {
  const React = require("react");
  const { View } = require("react-native");
  return React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ scrollTo: () => {} }));
    return <View {...props} />;
  });
});

// Controllable mutation so we can assert save is called exactly once on completion.
const mockMutateAsync = jest.fn().mockResolvedValue({});
jest.mock("@/hooks/useHealthTracking", () => ({
  useLogGeneralCheck: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

// Switchable locale — same shape as the HealthTrack suite — so the modal can be
// asserted in EN and ES against the real dictionaries.
const mockLocaleState = { locale: "en" };
jest.mock("react-i18next", () => {
  const dicts = {
    en: require("@/i18n/locales/en.json"),
    es: require("@/i18n/locales/es.json"),
  };
  const resolve = (dict, k) =>
    k.split(".").reduce((o, part) => (o == null ? o : o[part]), dict);
  return {
    useTranslation: () => ({
      t: (key, vars) => {
        let s = resolve(dicts[mockLocaleState.locale], key);
        if (typeof s !== "string") return key;
        if (vars)
          for (const [name, val] of Object.entries(vars))
            s = s.replace(new RegExp(`{{${name}}}`, "g"), String(val));
        return s;
      },
    }),
  };
});

import GeneralCheckModal from "./GeneralCheckModal";
import { CHECK_AREAS } from "@/data/generalCheckData";

beforeEach(() => {
  mockLocaleState.locale = "en";
  mockMutateAsync.mockClear();
});

test("Next is disabled until a status is picked, then enables and advances (EN)", () => {
  const { getByText, queryByText } = render(
    <GeneralCheckModal visible onClose={jest.fn()} />,
  );

  // First area, nothing chosen yet: the hint is shown and the flow is on step 1.
  expect(getByText("Choose an option to continue")).toBeTruthy();
  expect(getByText(`1 of ${CHECK_AREAS.length}`)).toBeTruthy();

  // Pressing the (disabled) Next before choosing does nothing — still on step 1.
  fireEvent.press(getByText("Next"));
  expect(getByText(`1 of ${CHECK_AREAS.length}`)).toBeTruthy();

  // Choosing a status enables Next: the hint disappears and Next now advances.
  fireEvent.press(getByText("Looks usual"));
  expect(queryByText("Choose an option to continue")).toBeNull();
  fireEvent.press(getByText("Next"));
  expect(getByText(`2 of ${CHECK_AREAS.length}`)).toBeTruthy();
});

test("walking every area to the end saves once and closes", async () => {
  const onClose = jest.fn();
  const { getByText } = render(
    <GeneralCheckModal visible onClose={onClose} />,
  );

  for (let i = 0; i < CHECK_AREAS.length; i++) {
    fireEvent.press(getByText("Looks usual"));
    if (i < CHECK_AREAS.length - 1) {
      fireEvent.press(getByText("Next"));
    } else {
      // Last area: the primary button reads "Complete" and persists the check.
      fireEvent.press(getByText("Complete"));
    }
  }

  // Save happened exactly once; with no "changed" areas the modal closes straight away
  // once the awaited mutation resolves.
  expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(onClose).toHaveBeenCalled());
});

test("renders fully localized in Spanish (es-AR)", () => {
  mockLocaleState.locale = "es";
  const { getByText } = render(
    <GeneralCheckModal visible onClose={jest.fn()} />,
  );
  // Title, the status prompt + options, the disabled-Next hint, and the primary CTA.
  expect(getByText("Chequeo rápido")).toBeTruthy();
  expect(getByText("¿Cómo se ve?")).toBeTruthy();
  expect(getByText("Se ve normal")).toBeTruthy();
  expect(getByText("Algo cambió")).toBeTruthy();
  expect(getByText("Elegí una opción para continuar")).toBeTruthy();
  expect(getByText("Siguiente")).toBeTruthy();
});

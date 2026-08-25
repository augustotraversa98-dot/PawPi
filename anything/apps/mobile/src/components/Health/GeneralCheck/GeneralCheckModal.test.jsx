// GeneralCheckModal (Quick Check) — the per-area health walkthrough. This suite pins
// the on-device fix from the 2026-08-18 revision (NR1): the owner was TRAPPED on the
// first area because "Next" was a hard gate that only enabled after a status was picked.
// Now every area is OPTIONAL — "Next" always advances (an un-checked area is just "not
// checked"), the status choice shows an optional hint instead of a required one, and any
// of the 8 areas is directly reachable via the area stepper. Also pins the full EN+ES
// localization of the modal (previously hardcoded English). The logging hook and native
// wrappers are mocked.

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

// QC-B: the photo buttons are wired to expo-image-picker + useUpload. Mock both so we
// can prove the buttons are no longer dead and the uploaded URL lands on the area.
const mockUpload = jest.fn().mockResolvedValue({ url: "https://cdn/photo.jpg" });
jest.mock("@/utils/useUpload", () => ({
  __esModule: true,
  default: () => [mockUpload, { loading: false }],
}));
// Inline jest.fn()s (the mock factory is hoisted above const declarations, so it must
// not close over an outer variable). Default resolutions are set in beforeEach via the
// imported ImagePicker namespace.
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: "Images" },
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
import * as ImagePicker from "expo-image-picker";

beforeEach(() => {
  mockLocaleState.locale = "en";
  mockMutateAsync.mockClear();
  mockUpload.mockClear();
  ImagePicker.requestCameraPermissionsAsync.mockReset().mockResolvedValue({ granted: true });
  ImagePicker.requestMediaLibraryPermissionsAsync.mockReset().mockResolvedValue({ granted: true });
  ImagePicker.launchCameraAsync
    .mockReset()
    .mockResolvedValue({ canceled: false, assets: [{ uri: "file:///cam.jpg", mimeType: "image/jpeg" }] });
  ImagePicker.launchImageLibraryAsync
    .mockReset()
    .mockResolvedValue({ canceled: false, assets: [{ uri: "file:///lib.jpg" }] });
});

test("Next always advances even with no per-area status picked (no trap) (EN)", () => {
  const { getByText, queryByText } = render(
    <GeneralCheckModal visible onClose={jest.fn()} />,
  );

  // First area, nothing chosen: the status is OPTIONAL, so an optional hint is shown
  // (not a required "choose to continue" block) and the flow is on step 1.
  expect(getByText("Optional — skip if you didn't check this area")).toBeTruthy();
  expect(getByText(`1 of ${CHECK_AREAS.length}`)).toBeTruthy();

  // Pressing Next WITHOUT choosing a status advances anyway — the owner is no longer
  // trapped on the first area.
  fireEvent.press(getByText("Next"));
  expect(getByText(`2 of ${CHECK_AREAS.length}`)).toBeTruthy();

  // Choosing a status still works and clears the optional hint.
  fireEvent.press(getByText("Looks usual"));
  expect(queryByText("Optional — skip if you didn't check this area")).toBeNull();
  fireEvent.press(getByText("Next"));
  expect(getByText(`3 of ${CHECK_AREAS.length}`)).toBeTruthy();
});

test("the area stepper jumps directly to any body area (EN)", () => {
  const { getByText, getAllByText } = render(
    <GeneralCheckModal visible onClose={jest.fn()} />,
  );

  // Start on area 1 (Eyes). Tapping the "Energy" chip in the stepper jumps straight
  // to the last area — its primary button becomes "Complete".
  expect(getByText(`1 of ${CHECK_AREAS.length}`)).toBeTruthy();
  // "Energy" appears both in the stepper chip and (after the jump) the area card; the
  // stepper chip is the first occurrence and is what we press.
  fireEvent.press(getAllByText("Energy")[0]);
  expect(getByText(`${CHECK_AREAS.length} of ${CHECK_AREAS.length}`)).toBeTruthy();
  expect(getByText("Complete")).toBeTruthy();
});

test("progress tracks areas ASSESSED, not the current position (EN)", () => {
  const { getByText, getAllByText, queryByText } = render(
    <GeneralCheckModal visible onClose={jest.fn()} />,
  );

  // Nothing assessed yet — the assessed counter reads 0, regardless of position.
  expect(getByText(`0 of ${CHECK_AREAS.length} checked`)).toBeTruthy();

  // Jump to the LAST area (Energy) without choosing any status. Position is now
  // "8 of 8", but the progress counter must NOT jump to "8 of 8 checked" (the old
  // bug read this as 100% complete with nothing assessed).
  fireEvent.press(getAllByText("Energy")[0]);
  expect(getByText(`${CHECK_AREAS.length} of ${CHECK_AREAS.length}`)).toBeTruthy(); // position
  expect(getByText(`0 of ${CHECK_AREAS.length} checked`)).toBeTruthy(); // still nothing assessed
  expect(
    queryByText(`${CHECK_AREAS.length} of ${CHECK_AREAS.length} checked`),
  ).toBeNull();

  // Assessing this area is what moves the progress counter.
  fireEvent.press(getByText("Looks usual"));
  expect(getByText(`1 of ${CHECK_AREAS.length} checked`)).toBeTruthy();
});

test("Take photo is wired (camera → upload → stored on the area's payload) (EN)", async () => {
  const { getByText, getAllByText, findByLabelText } = render(
    <GeneralCheckModal visible onClose={jest.fn()} />,
  );

  // Pressing "Take photo" (previously a dead button) now runs the capture flow.
  fireEvent.press(getByText("Take photo"));
  await waitFor(() =>
    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalled(),
  );
  await waitFor(() => expect(mockUpload).toHaveBeenCalled());

  // A thumbnail with a remove control appears for the uploaded photo.
  await findByLabelText("Remove photo");

  // Complete the check and confirm the uploaded URL is carried in the per-area payload
  // for the current area (Eyes) — the detail is no longer dropped.
  fireEvent.press(getAllByText("Energy")[0]); // jump to last area to reach "Complete"
  fireEvent.press(getByText("Complete"));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
  const payload = mockMutateAsync.mock.calls[0][0];
  expect(payload.areas.eyes.photos).toEqual(["https://cdn/photo.jpg"]);
});

test("denied photo permission shows a graceful message and adds no photo (EN)", async () => {
  ImagePicker.requestCameraPermissionsAsync.mockResolvedValueOnce({ granted: false });
  const { getByText, queryByLabelText } = render(
    <GeneralCheckModal visible onClose={jest.fn()} />,
  );
  fireEvent.press(getByText("Take photo"));
  await waitFor(() =>
    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalled(),
  );
  // No upload attempted, no thumbnail added.
  expect(mockUpload).not.toHaveBeenCalled();
  expect(queryByLabelText("Remove photo")).toBeNull();
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

test("bottom sheet has a definite height so the flex:1 scroll body can't collapse", () => {
  // Regression guard for the zero-height bug: the sheet was sized with maxHeight only, so
  // its flex:1 KeyboardAwareScrollView resolved to 0 height and the status options became
  // invisible (Next permanently disabled). A DEFINITE height is what gives the scroll body
  // room to fill. This is a structural proxy — the real collapse only reproduces under a
  // measuring layout engine, so on-device/rendered verification is still required.
  const { toJSON } = render(<GeneralCheckModal visible onClose={jest.fn()} />);

  const flatten = (s) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s || {});
  const styles = [];
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.props?.style) styles.push(flatten(node.props.style));
    (node.children || []).forEach(walk);
  };
  walk(toJSON());

  const sheet = styles.find((st) => st.height === "90%");
  expect(sheet).toBeTruthy();
  // And it must not be the old maxHeight-only sizing that caused the collapse.
  expect(styles.some((st) => st.maxHeight === "90%" && st.height == null)).toBe(false);
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
  expect(getByText("Opcional — saltealo si no revisaste esta zona")).toBeTruthy();
  expect(getByText("Siguiente")).toBeTruthy();
});

// ── Quick mode v2: only today's SUGGESTED areas render, each UNANSWERED, and Save is
//    gated until every one is explicitly answered (no hollow all-usual write). ──

test("quick mode: renders only the suggested areas, unanswered, with Save disabled", () => {
  const onClose = jest.fn();
  const { getByText, queryByLabelText } = render(
    <GeneralCheckModal
      visible
      mode="quick"
      suggestedAreas={["paws", "ears"]}
      onClose={onClose}
    />,
  );

  // Only the two suggested areas are offered — a non-suggested area (Eyes) is absent.
  expect(queryByLabelText("Paws: Looks usual")).toBeTruthy();
  expect(queryByLabelText("Ears: Looks usual")).toBeTruthy();
  expect(queryByLabelText("Eyes: Looks usual")).toBeNull();

  // Nothing answered yet → the save hint shows and pressing Save is a no-op.
  expect(getByText("Answer the suggested areas to save")).toBeTruthy();
  fireEvent.press(getByText("Save"));
  expect(mockMutateAsync).not.toHaveBeenCalled();
});

test("quick mode: Save enables only after every suggested area is answered", async () => {
  const onClose = jest.fn();
  const onSaved = jest.fn();
  mockMutateAsync.mockResolvedValueOnce({ check: { id: 5 } });

  const { getByText, getByLabelText, queryByText } = render(
    <GeneralCheckModal
      visible
      mode="quick"
      suggestedAreas={["paws", "ears"]}
      onClose={onClose}
      onSaved={onSaved}
    />,
  );

  // Answer only the first suggested area → still blocked (hint remains, no write).
  fireEvent.press(getByLabelText("Paws: Looks usual"));
  fireEvent.press(getByText("Save"));
  expect(mockMutateAsync).not.toHaveBeenCalled();
  expect(getByText("Answer the suggested areas to save")).toBeTruthy();

  // Answer the second → the hint clears and Save persists exactly once.
  fireEvent.press(getByLabelText("Ears: Looks usual"));
  expect(queryByText("Answer the suggested areas to save")).toBeNull();
  fireEvent.press(getByText("Save"));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));

  // Only the answered (suggested) areas carry a status; untouched ones stay undefined.
  const payload = mockMutateAsync.mock.calls[0][0];
  expect(payload.areas.paws.status).toBe("usual");
  expect(payload.areas.ears.status).toBe("usual");
  expect(payload.areas.eyes).toBeUndefined();

  await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 5 }));
});

test("quick mode: flagging a change reveals options and persists them", async () => {
  const { getByText, getByLabelText, queryByText } = render(
    <GeneralCheckModal
      visible
      mode="quick"
      suggestedAreas={["paws", "ears"]}
      onClose={jest.fn()}
    />,
  );

  // Change options are hidden until an area is marked "something changed".
  expect(queryByText("What changed? (select all that apply)")).toBeNull();

  fireEvent.press(getByLabelText("Paws: Something changed"));
  expect(getByText("What changed? (select all that apply)")).toBeTruthy();
  fireEvent.press(getByText("Limping"));

  // Answer the other suggested area so Save enables, then persist.
  fireEvent.press(getByLabelText("Ears: Looks usual"));
  fireEvent.press(getByText("Save"));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  const payload = mockMutateAsync.mock.calls[0][0];
  expect(payload.areas.paws.status).toBe("changed");
  expect(payload.areas.paws.changes).toEqual(["limping"]);
  expect(payload.areas.ears.status).toBe("usual");
});

test("quick mode: falls back to the fixed opening order when no suggestions are passed", () => {
  const { queryByLabelText } = render(
    <GeneralCheckModal visible mode="quick" onClose={jest.fn()} />,
  );
  // Fallback = first QUICK_SUGGESTION_COUNT areas (eyes, ears).
  expect(queryByLabelText("Eyes: Looks usual")).toBeTruthy();
  expect(queryByLabelText("Ears: Looks usual")).toBeTruthy();
  expect(queryByLabelText("Teeth & Mouth: Looks usual")).toBeNull();
});

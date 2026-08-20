import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";

// Resolve i18n keys to their English values so text-based assertions still pass.
jest.mock("react-i18next", () => ({
  useTranslation: () => {
    const map = {
      "cadenceSelector.recommended": "Recommended",
      "cadenceSelector.labels.hourly": "Hourly",
      "cadenceSelector.labels.daily": "Daily",
      "cadenceSelector.labels.weekly": "Weekly",
      "cadenceSelector.labels.biweekly": "Every 2 weeks",
      "cadenceSelector.labels.monthly": "Monthly",
      "cadenceSelector.labels.every3Months": "Every 3 months",
      "cadenceSelector.labels.every6Months": "Every 6 months",
      "cadenceSelector.labels.yearly": "Yearly",
      "cadenceSelector.labels.custom": "Custom",
      "cadenceSelector.labels.once": "Once / Never",
    };
    return { t: (k) => map[k] ?? k };
  },
}));

import CadenceFrequencySelector, {
  CADENCE_LABELS,
} from "./CadenceFrequencySelector";
import { ROUTINE_FREQUENCY } from "@/data/routinesData";

const render = (props) => {
  let renderer;
  act(() => {
    renderer = TestRenderer.create(<CadenceFrequencySelector {...props} />);
  });
  return renderer;
};

const findOption = (renderer, freq) => {
  const matches = renderer.root.findAll(
    (n) =>
      n.props.testID === `cadence-frequency-${freq}` &&
      typeof n.props.onPress === "function",
  );
  return matches[0];
};

const press = (renderer, freq) => {
  act(() => findOption(renderer, freq).props.onPress());
};

const allTexts = (renderer) =>
  renderer.root.findAllByType(Text).map((n) => n.props.children);

describe("CadenceFrequencySelector", () => {
  it("renders all four cadence options by default", () => {
    const r = render({
      value: ROUTINE_FREQUENCY.WEEKLY,
      onChange: jest.fn(),
    });

    for (const freq of [
      ROUTINE_FREQUENCY.DAILY,
      ROUTINE_FREQUENCY.WEEKLY,
      ROUTINE_FREQUENCY.BIWEEKLY,
      ROUTINE_FREQUENCY.MONTHLY,
    ]) {
      expect(findOption(r, freq)).toBeDefined();
    }
    expect(allTexts(r)).toEqual(
      expect.arrayContaining(["Daily", "Weekly", "Every 2 weeks", "Monthly"]),
    );
  });

  it("shows a Recommended hint on the recommended option without removing any option", () => {
    const r = render({
      value: ROUTINE_FREQUENCY.MONTHLY,
      onChange: jest.fn(),
      recommended: ROUTINE_FREQUENCY.BIWEEKLY,
    });

    // Host nodes only — composite <Text> and its host element share the testID.
    const hints = r.root.findAll(
      (n) =>
        typeof n.type === "string" &&
        typeof n.props.testID === "string" &&
        n.props.testID.startsWith("cadence-frequency-recommended-"),
    );
    expect(hints).toHaveLength(1);
    expect(hints[0].props.testID).toBe(
      `cadence-frequency-recommended-${ROUTINE_FREQUENCY.BIWEEKLY}`,
    );

    // All four options stay selectable — recommended is a hint, not a filter.
    for (const freq of [
      ROUTINE_FREQUENCY.DAILY,
      ROUTINE_FREQUENCY.WEEKLY,
      ROUTINE_FREQUENCY.BIWEEKLY,
      ROUTINE_FREQUENCY.MONTHLY,
    ]) {
      expect(findOption(r, freq)).toBeDefined();
    }
  });

  it("emits the ROUTINE_FREQUENCY constant on change", () => {
    const onChange = jest.fn();
    const r = render({ value: ROUTINE_FREQUENCY.WEEKLY, onChange });

    press(r, ROUTINE_FREQUENCY.DAILY);
    expect(onChange).toHaveBeenCalledWith(ROUTINE_FREQUENCY.DAILY);

    press(r, ROUTINE_FREQUENCY.BIWEEKLY);
    expect(onChange).toHaveBeenCalledWith(ROUTINE_FREQUENCY.BIWEEKLY);
  });

  it("narrows to the provided options", () => {
    const r = render({
      value: ROUTINE_FREQUENCY.WEEKLY,
      onChange: jest.fn(),
      options: [ROUTINE_FREQUENCY.WEEKLY, ROUTINE_FREQUENCY.MONTHLY],
    });

    expect(findOption(r, ROUTINE_FREQUENCY.WEEKLY)).toBeDefined();
    expect(findOption(r, ROUTINE_FREQUENCY.MONTHLY)).toBeDefined();
    expect(findOption(r, ROUTINE_FREQUENCY.DAILY)).toBeUndefined();
    expect(findOption(r, ROUTINE_FREQUENCY.BIWEEKLY)).toBeUndefined();
  });

  it("labels every cadence it can render", () => {
    expect(CADENCE_LABELS[ROUTINE_FREQUENCY.DAILY]).toBe("Daily");
    expect(CADENCE_LABELS[ROUTINE_FREQUENCY.WEEKLY]).toBe("Weekly");
    expect(CADENCE_LABELS[ROUTINE_FREQUENCY.BIWEEKLY]).toBe("Every 2 weeks");
    expect(CADENCE_LABELS[ROUTINE_FREQUENCY.MONTHLY]).toBe("Monthly");
  });
});

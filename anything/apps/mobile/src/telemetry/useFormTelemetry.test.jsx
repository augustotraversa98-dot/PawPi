import React from "react";
import { render } from "@testing-library/react-native";
import { useFormTelemetry } from "./useFormTelemetry";
import { trackForm } from "./track";

jest.mock("./track", () => ({ trackForm: jest.fn() }));

let api;
function Probe({ form = "add_dog", active = true, step }) {
  api = useFormTelemetry(form, step ? { active, step } : { active });
  return null;
}

const calls = () => trackForm.mock.calls.map((c) => c.join(":"));

beforeEach(() => {
  trackForm.mockClear();
  api = undefined;
});

describe("useFormTelemetry", () => {
  it("emits view on mount and abandon on unmount when never completed", () => {
    const { unmount } = render(<Probe />);
    expect(calls()).toEqual(["add_dog:main:view"]);
    unmount();
    expect(calls()).toEqual(["add_dog:main:view", "add_dog:main:abandon"]);
  });

  it("complete() records complete and suppresses the abandon", () => {
    const { unmount } = render(<Probe />);
    api.complete();
    unmount();
    expect(calls()).toEqual(["add_dog:main:view", "add_dog:main:complete"]);
  });

  it("step() records a new view and abandon reports the LAST step", () => {
    const { unmount } = render(<Probe form="onboarding" step="step_0" />);
    api.step("step_3");
    unmount();
    expect(calls()).toEqual([
      "onboarding:step_0:view",
      "onboarding:step_3:view",
      "onboarding:step_3:abandon",
    ]);
  });

  it("error() records an error without ending the form", () => {
    const { unmount } = render(<Probe />);
    api.error();
    expect(calls()).toEqual(["add_dog:main:view", "add_dog:main:error"]);
    unmount();
    expect(calls()[2]).toBe("add_dog:main:abandon");
  });

  it("an inactive form emits nothing; becoming active views, deactivating abandons", () => {
    const { rerender } = render(<Probe active={false} />);
    expect(calls()).toEqual([]);
    rerender(<Probe active />);
    expect(calls()).toEqual(["add_dog:main:view"]);
    rerender(<Probe active={false} />);
    expect(calls()).toEqual(["add_dog:main:view", "add_dog:main:abandon"]);
  });

  it("a completed form that is reopened starts fresh (view again, abandon if not completed)", () => {
    const { rerender } = render(<Probe />);
    api.complete();
    rerender(<Probe active={false} />);
    rerender(<Probe active />);
    rerender(<Probe active={false} />);
    expect(calls()).toEqual([
      "add_dog:main:view",
      "add_dog:main:complete",
      "add_dog:main:view",
      "add_dog:main:abandon",
    ]);
  });
});

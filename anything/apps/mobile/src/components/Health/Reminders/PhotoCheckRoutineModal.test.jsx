import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import PhotoCheckRoutineModal from "./PhotoCheckRoutineModal";

// Render pin for the Body-areas collapsible header (PR: photocheck-bodyareas-collapse).
// The multi-select is boxed behind a summary header like ScheduleBlock's Frequency:
//   - starts collapsed, chips hidden, summary reflects the default selection;
//   - tapping expands the chips; picking does NOT auto-collapse (multi-select);
//   - the summary lists up to two labels, then collapses to "N selected";
//   - a second header tap collapses; deselecting everything shows a placeholder.

function renderModal() {
  const onSave = jest.fn();
  const onClose = jest.fn();
  const utils = render(
    <PhotoCheckRoutineModal
      visible
      onClose={onClose}
      onSave={onSave}
      editingRoutine={null}
    />,
  );
  return { ...utils, onSave, onClose };
}

const summary = (api) => api.getByTestId("photo-bodyareas-value").props.children;

describe("PhotoCheckRoutineModal — Body-areas collapsible header", () => {
  it("starts collapsed with the default selection summarized and chips hidden", () => {
    const api = renderModal();
    expect(api.getByTestId("photo-bodyareas-toggle")).toBeTruthy();
    // Default selectedBodyAreas is ["paws"].
    expect(summary(api)).toBe("Paws");
    // Chips hidden while collapsed (Eyes only appears as a chip).
    expect(api.queryByText("Eyes")).toBeNull();
  });

  it("expands on tap, keeps multi-select open across picks, and updates the summary live", () => {
    const api = renderModal();
    fireEvent.press(api.getByTestId("photo-bodyareas-toggle"));

    // Expanded: chips are now visible.
    expect(api.getByText("Eyes")).toBeTruthy();

    // Pick Ears → two labels listed; still expanded (no auto-collapse).
    fireEvent.press(api.getByText("Ears"));
    expect(summary(api)).toBe("Paws, Ears");
    expect(api.getByText("Eyes")).toBeTruthy();

    // Pick Eyes → past two, collapses to a count; all picks persist.
    fireEvent.press(api.getByText("Eyes"));
    expect(summary(api)).toBe("3 selected");
    expect(api.getByText("Full Body")).toBeTruthy();
  });

  it("collapses on a second header tap, preserving the selection summary", () => {
    const api = renderModal();
    const toggle = api.getByTestId("photo-bodyareas-toggle");
    fireEvent.press(toggle); // expand
    fireEvent.press(api.getByText("Ears")); // Paws, Ears
    fireEvent.press(toggle); // collapse

    expect(api.queryByText("Full Body")).toBeNull(); // chips hidden
    expect(summary(api)).toBe("Paws, Ears"); // summary persists
  });

  it("shows a placeholder when nothing is selected", () => {
    const api = renderModal();
    fireEvent.press(api.getByTestId("photo-bodyareas-toggle"));
    // "Paws" shows in both the summary header and its chip; the chip is the
    // second match (header is rendered first). Press it to deselect.
    fireEvent.press(api.getAllByText("Paws")[1]); // deselect the only area
    expect(summary(api)).toBe("Select areas");
  });
});

// CareRing arcs — ITEM 3 regression. On a rest/paused day the ring used to paint ALL three arcs
// the same green (a "resting" colour) while the card beside it said "2 of 3": the owner read that
// as "everything is done". The arcs must always show what was really logged; a rest day only
// softens the OPEN arcs and adds the moon.

import React from "react";
import { render } from "@testing-library/react-native";
import Svg, { Path } from "react-native-svg";
import { CareRing } from "./CareRing";
import { COLORS } from "@/constants/colors";

const strokes = (ui) => {
  const { UNSAFE_getAllByType } = render(ui);
  return UNSAFE_getAllByType(Path).map((p) => p.props.stroke);
};

const REST_TRACK = "#DCE8D8";
const EMPTY_TRACK = "#EFE2D3";

describe("CareRing arcs", () => {
  test("rest day, walk + care done, moment open: two real colours and ONE soft arc (not three greens)", () => {
    const s = strokes(
      <CareRing state={{ walk_done: true, moment_done: false, care_done: true, rest_day: true }} />,
    );
    expect(s).toEqual([COLORS.coral, REST_TRACK, COLORS.sageDark]);
    expect(new Set(s).size).toBe(3); // the arcs are distinguishable, so "2 of 3" is visible in the ring
  });

  test("normal day, same logs: the open arc is the plain empty track", () => {
    expect(
      strokes(<CareRing state={{ walk_done: true, moment_done: false, care_done: true }} />),
    ).toEqual([COLORS.coral, EMPTY_TRACK, COLORS.sageDark]);
  });

  test("the centre shows the real n/3 count on a rest day too", () => {
    const { getByText } = render(
      <CareRing state={{ walk_done: true, moment_done: false, care_done: true, rest_day: true }} />,
    );
    expect(getByText("🌙")).toBeTruthy();
    expect(getByText("2/3")).toBeTruthy();
  });

  test("after the moment is deleted the ring goes back to 2/3 with an open Moment arc", () => {
    const withMoment = { walk_done: true, moment_done: true, care_done: true, ring_closed: true };
    const { rerender, UNSAFE_getAllByType, getByText } = render(<CareRing state={withMoment} />);
    expect(UNSAFE_getAllByType(Path).map((p) => p.props.stroke)).toEqual([
      COLORS.coral, COLORS.apricot, COLORS.sageDark,
    ]);
    rerender(<CareRing state={{ ...withMoment, moment_done: false, ring_closed: false }} />);
    expect(UNSAFE_getAllByType(Path).map((p) => p.props.stroke)).toEqual([
      COLORS.coral, EMPTY_TRACK, COLORS.sageDark,
    ]);
    expect(getByText("2/3")).toBeTruthy();
  });
});

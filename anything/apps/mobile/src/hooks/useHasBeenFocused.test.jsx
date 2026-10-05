// A tab screen is withheld (not mounted → fetches nothing) until the user first opens it, then stays
// mounted. Outside a navigator everything renders immediately (so screen unit tests are unaffected).

import React from "react";
import { Text } from "react-native";
import { render, act } from "@testing-library/react-native";
import { NavigationContext } from "@react-navigation/native";
import { FirstFocusGate } from "@/components/FirstFocusGate";
import { useHasBeenFocused } from "./useHasBeenFocused";
import { makeFakeNavigation } from "@/utils/fakeNavigation";

function Probe() {
  return <Text>{String(useHasBeenFocused())}</Text>;
}

test("no navigator → counts as focused (nothing is ever withheld)", () => {
  const { getByText } = render(<Probe />);
  expect(getByText("true")).toBeTruthy();
});

test("an already-focused screen is not delayed", () => {
  const { navigation } = makeFakeNavigation({ focused: true });
  const { getByText } = render(
    <NavigationContext.Provider value={navigation}>
      <Probe />
    </NavigationContext.Provider>,
  );
  expect(getByText("true")).toBeTruthy();
});

test("an unfocused screen is false until its first focus, then stays true and drops its listener", () => {
  const fake = makeFakeNavigation({ focused: false });
  const { getByText } = render(
    <NavigationContext.Provider value={fake.navigation}>
      <Probe />
    </NavigationContext.Provider>,
  );
  expect(getByText("false")).toBeTruthy();
  expect(fake.listenerCount()).toBe(1);

  act(() => fake.focus());
  expect(getByText("true")).toBeTruthy();
  expect(fake.listenerCount()).toBe(0);
});

test("FirstFocusGate does not mount its children until the first focus", () => {
  const mounted = jest.fn();
  function Child() {
    mounted();
    return <Text>CHILD</Text>;
  }
  const fake = makeFakeNavigation({ focused: false });
  const { queryByText, getByTestId } = render(
    <NavigationContext.Provider value={fake.navigation}>
      <FirstFocusGate backgroundColor="#FFF7EF">
        <Child />
      </FirstFocusGate>
    </NavigationContext.Provider>,
  );
  expect(mounted).not.toHaveBeenCalled();
  expect(queryByText("CHILD")).toBeNull();
  expect(getByTestId("first-focus-placeholder")).toBeTruthy();

  act(() => fake.focus());
  expect(queryByText("CHILD")).toBeTruthy();
  expect(queryByText("first-focus-placeholder")).toBeNull();
});

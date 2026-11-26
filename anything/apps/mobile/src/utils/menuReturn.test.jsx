// TestFlight: More → "Mi centro" → back did not land on the More menu. The menu is a sheet on the Profile tab
// root, so it closed to open the screen and stayed closed on the way back. These tests mount the REAL OwnerMenu
// inside REAL React Navigation routers (root Stack → Tabs → More Stack, the app's nesting), because what matters
// is which focus / tab events actually reach the menu.

import React from "react";
import { View } from "react-native";
import { render, act, fireEvent } from "@testing-library/react-native";
import {
  NavigationContainer,
  createNavigationContainerRef,
  createNavigatorFactory,
  useNavigationBuilder,
  StackRouter,
  StackActions,
  TabRouter,
  CommonActions,
} from "@react-navigation/native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/utils/auth/useAuth", () => ({ useAuth: () => ({ setAuth: jest.fn() }) }));
jest.mock("@/components/Pets/PetSwitcher", () => ({ PetSwitcher: () => null }));
jest.mock("@/hooks/useProviders", () => ({ useMyProviders: () => ({ data: [{ id: 1 }] }) }));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock("es"));

import { OwnerMenu } from "@/components/More/OwnerMenu";
import { MENU_REOPEN_DELAY_MS, watchMenuReturn } from "./menuReturn";

function makeNavigator(Router) {
  function Navigator({ children, initialRouteName }) {
    const { state, descriptors, NavigationContent } = useNavigationBuilder(Router, { children, initialRouteName });
    return (
      <NavigationContent>
        {state.routes.map((route) => (
          <View key={route.key}>{descriptors[route.key].render()}</View>
        ))}
      </NavigationContent>
    );
  }
  return createNavigatorFactory(Navigator)();
}
const RootStack = makeNavigator(StackRouter);
const Tabs = makeNavigator(TabRouter);
const MoreStack = makeNavigator(StackRouter);
const Empty = () => null;

// Where each menu entry lives, so the fake expo-router push drives the real navigators.
const ROOT_SCREENS = ["pet-sharing", "business"];
function setup() {
  const ref = createNavigationContainerRef();
  mockPush.mockImplementation((path) => {
    const name = path.split("/").pop();
    ref.dispatch(StackActions.push(name));
  });
  const MoreNavigator = () => (
    <MoreStack.Navigator>
      <MoreStack.Screen name="index" component={OwnerMenu} />
      <MoreStack.Screen name="hub" component={Empty} />
      <MoreStack.Screen name="settings" component={Empty} />
    </MoreStack.Navigator>
  );
  const TabsNavigator = () => (
    <Tabs.Navigator initialRouteName="more">
      <Tabs.Screen name="feed" component={Empty} />
      <Tabs.Screen name="more" component={MoreNavigator} />
    </Tabs.Navigator>
  );
  const api = render(
    <NavigationContainer ref={ref}>
      <RootStack.Navigator>
        <RootStack.Screen name="(tabs)" component={TabsNavigator} />
        {ROOT_SCREENS.map((n) => (
          <RootStack.Screen key={n} name={n} component={Empty} />
        ))}
      </RootStack.Navigator>
    </NavigationContainer>,
  );
  const menuIsOpen = () => api.queryByText("Mi centro") != null;
  const open = (label) => {
    fireEvent.press(api.getByLabelText("Abrir menú"));
    act(() => {
      fireEvent.press(api.getByText(label));
    });
  };
  const back = () => act(() => ref.dispatch(CommonActions.goBack()));
  const wait = () => act(() => jest.advanceTimersByTime(MENU_REOPEN_DELAY_MS + 10));
  return { ref, api, menuIsOpen, open, back, wait };
}

beforeEach(() => {
  jest.useFakeTimers();
  mockPush.mockReset();
});
afterEach(() => {
  jest.useRealTimers();
});

test("Mi centro → back lands on the More menu", () => {
  const h = setup();
  h.open("Mi centro");
  h.wait();
  expect(h.menuIsOpen()).toBe(false);

  h.back();
  h.wait();
  expect(h.menuIsOpen()).toBe(true);
});

test("a root-level screen (Family & caregivers) → back lands on the More menu too", () => {
  const h = setup();
  h.open("Familia y cuidadores");
  h.wait();
  expect(h.menuIsOpen()).toBe(false);

  h.back();
  h.wait();
  expect(h.menuIsOpen()).toBe(true);
});

test("switching tabs instead of going back never pops the menu open later", () => {
  const h = setup();
  h.open("Mi centro");
  act(() => h.ref.dispatch(CommonActions.navigate("feed")));
  act(() => h.ref.dispatch(CommonActions.navigate("more")));
  h.back(); // hub is still on this harness's stack (no popToTop here): coming back must stay quiet
  h.wait();
  expect(h.menuIsOpen()).toBe(false);
});

test("it reopens once: a later visit to the Profile root stays closed", () => {
  const h = setup();
  h.open("Mi centro");
  h.back();
  h.wait();
  fireEvent.press(h.api.getByLabelText("Cerrar menú"));
  expect(h.menuIsOpen()).toBe(false);

  act(() => h.ref.dispatch(StackActions.push("pet-sharing")));
  h.back();
  h.wait();
  expect(h.menuIsOpen()).toBe(false);
});

test("Business is a mode switch: coming back does not open the menu", () => {
  const h = setup();
  fireEvent.press(h.api.getByLabelText("Abrir menú"));
  const business = require("@/i18n/locales/es.json").business.menu.item;
  act(() => {
    fireEvent.press(h.api.getByText(business));
  });
  h.back();
  h.wait();
  expect(h.menuIsOpen()).toBe(false);
});

test("outside a navigator it does nothing and never throws", () => {
  const reopen = jest.fn();
  const watcher = watchMenuReturn(undefined, reopen);
  watcher.arm();
  watcher.dispose();
  expect(reopen).not.toHaveBeenCalled();
});

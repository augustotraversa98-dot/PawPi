// Regression: tapping "Family & caregivers" (More menu → /pet-sharing) sent a user who had just finished
// onboarding back INTO onboarding.
//
// Root cause (reproduced on the iOS Simulator, build 1.0.4 and main): the Profile tab listened for its tab to
// blur and called `navigation.popToTop()`. A root-stack screen pushed over the tabs also blurs the tab; the More
// stack was already at its root, so POP_TO_TOP could not be handled there and BUBBLED up to the root stack, which
// popped itself to its first route — for a fresh sign-up that is `/onboarding-photo`.
//
// These tests use REAL React Navigation routers (root Stack → Tabs → More Stack, the same nesting as
// app/_layout.jsx → (tabs)/_layout.jsx → (tabs)/more/_layout.jsx), because the bug lives in how actions bubble
// between navigators — a mocked `navigation` object (the previous test) can only ever assert the buggy call.

import React from "react";
import { View } from "react-native";
import { render, act } from "@testing-library/react-native";
import {
  NavigationContainer,
  createNavigationContainerRef,
  createNavigatorFactory,
  useNavigationBuilder,
  StackRouter,
  StackActions,
  TabRouter,
  CommonActions,
  useNavigation,
} from "@react-navigation/native";
import { popStackToRootOnTabLeave, stackKeyToPopOnTabBlur } from "./popStackOnTabLeave";

// Minimal navigators: all routes stay mounted (like native-stack / bottom tabs); only the router logic is real.
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

// `strategy` is "fixed" (the helper) or "legacy" (the old bare popToTop, kept as a control proving the harness
// really reproduces the bug).
function ProfileTabRoot({ strategy }) {
  const navigation = useNavigation();
  React.useEffect(() => {
    if (strategy === "fixed") return popStackToRootOnTabLeave(navigation);
    const parent = navigation.getParent();
    return parent.addListener("blur", () => navigation.popToTop());
  }, [navigation, strategy]);
  return null;
}

function setup({ strategy, rootRoutes, moreStackRoutes }) {
  const ref = createNavigationContainerRef();
  const MoreNavigator = () => (
    <MoreStack.Navigator>
      <MoreStack.Screen name="index">{() => <ProfileTabRoot strategy={strategy} />}</MoreStack.Screen>
      <MoreStack.Screen name="reminders" component={Empty} />
    </MoreStack.Navigator>
  );
  const TabsNavigator = () => (
    <Tabs.Navigator>
      <Tabs.Screen name="feed" component={Empty} />
      <Tabs.Screen name="more" component={MoreNavigator} />
    </Tabs.Navigator>
  );
  const initialState = {
    index: rootRoutes.length - 1,
    routes: rootRoutes.map((name) =>
      name === "(tabs)"
        ? {
            name,
            state: {
              index: 1, // the user is on the Profile (More) tab
              routes: [{ name: "feed" }, { name: "more", state: { index: moreStackRoutes.length - 1, routes: moreStackRoutes.map((n) => ({ name: n })) } }],
            },
          }
        : { name },
    ),
  };
  render(
    <NavigationContainer ref={ref} initialState={initialState}>
      <RootStack.Navigator>
        <RootStack.Screen name="onboarding-photo" component={Empty} />
        <RootStack.Screen name="(tabs)" component={TabsNavigator} />
        <RootStack.Screen name="pet-sharing" component={Empty} />
      </RootStack.Navigator>
    </NavigationContainer>,
  );
  const rootNames = () => ref.getRootState().routes.map((r) => r.name);
  const moreNames = () => {
    const tabs = ref.getRootState().routes.find((r) => r.name === "(tabs)").state;
    return tabs.routes.find((r) => r.name === "more").state.routes.map((r) => r.name);
  };
  const selectedTab = () => {
    const tabs = ref.getRootState().routes.find((r) => r.name === "(tabs)").state;
    return tabs.routes[tabs.index].name;
  };
  return { ref, rootNames, moreNames, selectedTab };
}

// What a user who JUST finished onboarding has: onboarding-photo stays under the tabs (the wizard replaces itself
// with the app, it does not clear the stack).
const FRESH_SIGNUP_ROOT = ["onboarding-photo", "(tabs)"];

describe("opening a root-level screen from the Profile tab (OwnerMenu → /pet-sharing)", () => {
  test("CONTROL — the old bare popToTop() popped the ROOT stack back to onboarding (the reported bug)", () => {
    const h = setup({ strategy: "legacy", rootRoutes: FRESH_SIGNUP_ROOT, moreStackRoutes: ["index"] });
    expect(h.rootNames()).toEqual(["onboarding-photo", "(tabs)"]);

    act(() => h.ref.dispatch(StackActions.push("pet-sharing")));

    // Reproduces the incident: the pushed screen is gone AND so is the app — the owner is back in the wizard.
    expect(h.rootNames()).toEqual(["onboarding-photo"]);
  });

  test("a just-onboarded owner opening Family & caregivers STAYS there (never back in onboarding)", () => {
    const h = setup({ strategy: "fixed", rootRoutes: FRESH_SIGNUP_ROOT, moreStackRoutes: ["index"] });

    act(() => h.ref.dispatch(StackActions.push("pet-sharing")));

    expect(h.rootNames()).toEqual(["onboarding-photo", "(tabs)", "pet-sharing"]);
    expect(h.rootNames()).not.toEqual(["onboarding-photo"]);
  });

  test("an owner who relaunched (stack is just the app) also stays on pet-sharing", () => {
    const h = setup({ strategy: "fixed", rootRoutes: ["(tabs)"], moreStackRoutes: ["index"] });

    act(() => h.ref.dispatch(StackActions.push("pet-sharing")));

    expect(h.rootNames()).toEqual(["(tabs)", "pet-sharing"]);
  });

  test("going back from pet-sharing returns to the Profile tab", () => {
    const h = setup({ strategy: "fixed", rootRoutes: FRESH_SIGNUP_ROOT, moreStackRoutes: ["index"] });
    act(() => h.ref.dispatch(StackActions.push("pet-sharing")));
    act(() => h.ref.dispatch(CommonActions.goBack()));

    expect(h.rootNames()).toEqual(["onboarding-photo", "(tabs)"]);
    expect(h.selectedTab()).toBe("more");
  });

  test("a root screen opened from a NESTED More screen keeps that screen under it (back returns to it)", () => {
    const h = setup({ strategy: "fixed", rootRoutes: FRESH_SIGNUP_ROOT, moreStackRoutes: ["index", "reminders"] });

    act(() => h.ref.dispatch(StackActions.push("pet-sharing")));

    expect(h.rootNames()).toEqual(["onboarding-photo", "(tabs)", "pet-sharing"]);
    expect(h.moreNames()).toEqual(["index", "reminders"]); // tab still selected → nothing popped
  });
});

describe("the reset the listener exists for still works (#571): leaving the Profile tab for another tab", () => {
  test("pops a pushed More screen back to the Profile root — and touches nothing else", () => {
    const h = setup({ strategy: "fixed", rootRoutes: FRESH_SIGNUP_ROOT, moreStackRoutes: ["index", "reminders"] });

    act(() => h.ref.dispatch(CommonActions.navigate("feed")));

    expect(h.selectedTab()).toBe("feed");
    expect(h.moreNames()).toEqual(["index"]);
    expect(h.rootNames()).toEqual(["onboarding-photo", "(tabs)"]);
  });

  test("switching tabs while the More stack is already at its root changes nothing but the selected tab", () => {
    const h = setup({ strategy: "fixed", rootRoutes: FRESH_SIGNUP_ROOT, moreStackRoutes: ["index"] });

    act(() => h.ref.dispatch(CommonActions.navigate("feed")));

    expect(h.selectedTab()).toBe("feed");
    expect(h.rootNames()).toEqual(["onboarding-photo", "(tabs)"]);
  });
});

describe("stackKeyToPopOnTabBlur (pure decision)", () => {
  test("pops (targeted at the stack key) only when a DIFFERENT tab is now selected and there is something to pop", () => {
    expect(stackKeyToPopOnTabBlur({ key: "S", index: 1 }, "feed", "more")).toBe("S");
  });
  test("nothing to pop → null", () => {
    expect(stackKeyToPopOnTabBlur({ key: "S", index: 0 }, "feed", "more")).toBeNull();
  });
  test("the same tab is still selected (a screen was pushed over the tabs) → null", () => {
    expect(stackKeyToPopOnTabBlur({ key: "S", index: 1 }, "more", "more")).toBeNull();
  });
  test("unknown 'selected when focused' still pops, but only ever targeted at this stack", () => {
    expect(stackKeyToPopOnTabBlur({ key: "S", index: 1 }, "feed", null)).toBe("S");
  });
  test("missing state never throws and never pops", () => {
    expect(stackKeyToPopOnTabBlur(undefined, "feed", "more")).toBeNull();
    expect(stackKeyToPopOnTabBlur({ index: 1 }, "feed", "more")).toBeNull();
  });
  test("no parent navigator → no subscription", () => {
    expect(popStackToRootOnTabLeave({ getParent: () => undefined })).toBeUndefined();
  });
});

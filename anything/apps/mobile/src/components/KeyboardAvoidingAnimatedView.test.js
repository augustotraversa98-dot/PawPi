import React from "react";
import { Keyboard, Text } from "react-native";
import { render } from "@testing-library/react-native";
import KeyboardAvoidingAnimatedView from "./KeyboardAvoidingAnimatedView";

// Regression (RedBox on teardown): Keyboard.addListener shares one app-wide
// listener registry per event name — it is not scoped to whichever component
// called it. This component used to clean up with
// Keyboard.removeAllListeners(eventName), which removes EVERY listener
// currently registered for that event name, including ones added by other
// mounted keyboard-aware components (e.g. KeyboardAwareScrollView). When that
// other component's own .remove() then ran, native was told to remove more
// listeners than were ever added, crashing with "Attempted to remove more
// RCTKeyboardObserver listeners than added" — reliably on a full-stack
// teardown (Reset App Data / logout) where several such components unmount
// together. The fix: keep this component's own subscriptions and .remove()
// only those. These tests guard against reintroducing removeAllListeners and
// against any add/remove imbalance for THIS component's own subscriptions.
describe("KeyboardAvoidingAnimatedView — keyboard listener cleanup", () => {
  it("never calls Keyboard.removeAllListeners (would tear down other components' listeners)", () => {
    const removeAllListenersSpy = jest.spyOn(Keyboard, "removeAllListeners");
    const addSpy = jest.spyOn(Keyboard, "addListener");

    const { unmount } = render(
      <KeyboardAvoidingAnimatedView>
        <Text>content</Text>
      </KeyboardAvoidingAnimatedView>,
    );
    unmount();

    expect(removeAllListenersSpy).not.toHaveBeenCalled();
    expect(addSpy).toHaveBeenCalled();

    removeAllListenersSpy.mockRestore();
    addSpy.mockRestore();
  });

  it("removes exactly the subscriptions it added, exactly once each, on unmount", () => {
    const subscriptions = [];
    const addSpy = jest.spyOn(Keyboard, "addListener").mockImplementation(() => {
      const subscription = { remove: jest.fn() };
      subscriptions.push(subscription);
      return subscription;
    });

    const { unmount } = render(
      <KeyboardAvoidingAnimatedView>
        <Text>content</Text>
      </KeyboardAvoidingAnimatedView>,
    );

    expect(subscriptions.length).toBeGreaterThan(0);
    subscriptions.forEach((subscription) => {
      expect(subscription.remove).not.toHaveBeenCalled();
    });

    unmount();

    // Every subscription this instance created is removed exactly once —
    // never left dangling, never double-removed.
    subscriptions.forEach((subscription) => {
      expect(subscription.remove).toHaveBeenCalledTimes(1);
    });

    addSpy.mockRestore();
  });

  it("does not throw when a sibling keyboard listener for the same event is torn down independently", () => {
    // Simulates the real crash scenario: two components share the same
    // native event registry per event name. A well-behaved sibling removes
    // only its own subscription — this component's cleanup must do the same
    // and never reach for removeAllListeners, so the sibling's still-mounted
    // listener (and vice versa) is never affected.
    const registry = {};
    const addSpy = jest.spyOn(Keyboard, "addListener").mockImplementation((eventName) => {
      registry[eventName] = (registry[eventName] || 0) + 1;
      return {
        remove: jest.fn(() => {
          if (registry[eventName] <= 0) {
            throw new Error(
              `Attempted to remove more RCTKeyboardObserver listeners than added for ${eventName}`,
            );
          }
          registry[eventName] -= 1;
        }),
      };
    });
    const removeAllListenersSpy = jest
      .spyOn(Keyboard, "removeAllListeners")
      .mockImplementation((eventName) => {
        registry[eventName] = 0;
      });

    // A sibling component's own listener for the same event names.
    Keyboard.addListener("keyboardWillShow", () => {});
    Keyboard.addListener("keyboardWillHide", () => {});

    const { unmount } = render(
      <KeyboardAvoidingAnimatedView>
        <Text>content</Text>
      </KeyboardAvoidingAnimatedView>,
    );

    expect(() => unmount()).not.toThrow();
    // Only this instance's own listeners were removed — the sibling's are
    // still standing (registry never hit 0 via removeAllListeners since it's
    // no longer called).
    expect(removeAllListenersSpy).not.toHaveBeenCalled();
    expect(registry.keyboardWillShow).toBe(1);
    expect(registry.keyboardWillHide).toBe(1);

    addSpy.mockRestore();
    removeAllListenersSpy.mockRestore();
  });
});

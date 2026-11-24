import { Keyboard } from "react-native";
import { renderHook, act } from "@testing-library/react-native";
import useKeyboardMetrics from "./useKeyboardMetrics";

let handlers;
let removed;
let addSpy;
beforeEach(() => {
  handlers = {};
  removed = [];
  addSpy = jest.spyOn(Keyboard, "addListener").mockImplementation((name, cb) => {
    handlers[name] = cb;
    return { remove: () => removed.push(name) };
  });
});
afterEach(() => addSpy.mockRestore());

// jest's Dimensions window height is 1334.
describe("useKeyboardMetrics (iOS)", () => {
  it("starts hidden", () => {
    const { result } = renderHook(() => useKeyboardMetrics());
    expect(result.current).toEqual({ keyboardVisible: false, keyboardOverlap: 0 });
  });

  it("reports the overlap on show and clears it on hide", () => {
    const { result } = renderHook(() => useKeyboardMetrics());
    act(() => handlers.keyboardWillShow({ duration: 0, endCoordinates: { screenY: 1000 } }));
    expect(result.current).toEqual({ keyboardVisible: true, keyboardOverlap: 334 });
    act(() => handlers.keyboardWillHide({ duration: 0 }));
    expect(result.current).toEqual({ keyboardVisible: false, keyboardOverlap: 0 });
  });

  it("follows the keyboard changing height while it is up (EN <-> ES keyboard, predictive bar)", () => {
    const { result } = renderHook(() => useKeyboardMetrics());
    act(() => handlers.keyboardWillShow({ duration: 0, endCoordinates: { screenY: 1000 } }));
    act(() => handlers.keyboardWillChangeFrame({ endCoordinates: { screenY: 960 } }));
    expect(result.current.keyboardOverlap).toBe(374);
  });

  it("ignores a frame change when no keyboard is up", () => {
    const { result } = renderHook(() => useKeyboardMetrics());
    act(() => handlers.keyboardWillChangeFrame({ endCoordinates: { screenY: 960 } }));
    expect(result.current.keyboardVisible).toBe(false);
  });

  it("removes each subscription individually on unmount", () => {
    const { unmount } = renderHook(() => useKeyboardMetrics());
    unmount();
    expect(removed.sort()).toEqual(
      ["keyboardWillChangeFrame", "keyboardWillHide", "keyboardWillShow"].sort(),
    );
  });

  it("survives a malformed event (never NaN)", () => {
    const { result } = renderHook(() => useKeyboardMetrics());
    act(() => handlers.keyboardWillShow({}));
    expect(result.current.keyboardVisible).toBe(true);
    expect(result.current.keyboardOverlap).toBe(0);
  });
});

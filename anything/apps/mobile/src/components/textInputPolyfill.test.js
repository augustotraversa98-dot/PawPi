// The app swaps React Native's TextInput for a wrapper (metro.config.js NATIVE_ALIASES).
// The wrapper once dropped the static `TextInput.State`, so on a device
// KeyboardAwareScrollView could not find the focused field and never scrolled it above
// the keyboard, while every jest test (which does not apply the Metro alias) passed.
import RNTextInput from "react-native/Libraries/Components/TextInput/TextInput";
import WrappedTextInput from "../../polyfills/native/textinput.native";

const fs = require("fs");
const path = require("path");

describe("native TextInput wrapper", () => {
  it("is still the module Metro puts in place of TextInput", () => {
    const metro = fs.readFileSync(path.resolve(__dirname, "../../metro.config.js"), "utf8");
    expect(metro).toContain("./polyfills/native/textinput.native.jsx");
  });

  it("keeps TextInput.State so the focused field can be found", () => {
    expect(WrappedTextInput.State).toBeDefined();
    expect(WrappedTextInput.State).toBe(RNTextInput.State);
    expect(typeof WrappedTextInput.State.currentlyFocusedInput).toBe("function");
  });
});

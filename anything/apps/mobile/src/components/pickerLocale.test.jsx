// The native date and time pickers speak the app's language, not the phone's, and the time wheel keeps a 24-hour clock.
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import DateField from "./DateField";
import TimeField from "./TimeField";

let mockLang;
jest.mock("react-i18next", () => ({
  ...require("@/i18n/testMock").makeReactI18nextMock(),
  getI18n: () => ({ language: mockLang }),
}));
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = require("react-native");
  return { __esModule: true, default: (props) => <View {...props} /> };
});
jest.mock("lucide-react-native", () => ({ Calendar: () => null, Clock: () => null }));

const pickerOf = (Field, props) => {
  const s = render(<Field testID="field" onChange={jest.fn()} {...props} />);
  fireEvent.press(s.getByTestId("field"));
  return s.getByTestId("field-picker");
};

test.each([
  ["es", "es-AR"],
  ["en", "en-GB"],
])("(%s) the calendar uses %s", (lang, locale) => {
  mockLang = lang;
  expect(pickerOf(DateField, { value: "2025-04-21" }).props.locale).toBe(locale);
});

test.each(["es", "en"])("(%s) the time wheel is in that language and 24-hour", (lang) => {
  mockLang = lang;
  const { locale } = pickerOf(TimeField, { value: "20:30" }).props;
  expect(locale.startsWith(`${lang}-`)).toBe(true);
  const hour = new Intl.DateTimeFormat(locale, { hour: "numeric" });
  expect(hour.resolvedOptions().hourCycle).toBe("h23");
});

import { describe, it, expect } from "vitest";
import {
  cleanFinderFields,
  composeFinderText,
  finderContactError,
  isValidEmail,
  isValidPhone,
  mailtoHref,
  parseFinderSubmission,
  telHref,
} from "./finder";

describe("finder phone / email validation", () => {
  it.each(["+54 9 11 5555-0101", "(011) 4000.7777", "123456"])("accepts the phone %s", (v) => {
    expect(isValidPhone(v)).toBe(true);
  });
  it.each(["12345", "call me", "+54 11 abc", "1".repeat(21), "12 34 56 ".repeat(6), "123456?x=1", ""])(
    "refuses the phone %s",
    (v) => expect(isValidPhone(v)).toBe(false),
  );
  it.each(["ana@example.test", "o'brien+dog@mail.example.org"])("accepts the email %s", (v) => {
    expect(isValidEmail(v)).toBe(true);
  });
  it.each([
    "ana",
    "ana@example",
    "a b@example.test",
    "a@example.test?bcc=x@example.test",
    "a@example.test,b@example.test",
    "a%40b@example.test",
    "javascript:alert(1)@x.test",
    `${"a".repeat(250)}@example.test`,
  ])("refuses the email %s", (v) => expect(isValidEmail(v)).toBe(false));

  it("needs at least one of phone / email, and each given one must be valid", () => {
    expect(finderContactError({ phone: "", email: "" })).toBe("contact_required");
    expect(finderContactError({ phone: "123456", email: "" })).toBeNull();
    expect(finderContactError({ phone: "", email: "a@example.test" })).toBeNull();
    expect(finderContactError({ phone: "123456", email: "nope" })).toBe("invalid_email");
    expect(finderContactError({ phone: "nope", email: "a@example.test" })).toBe("invalid_phone");
  });
});

describe("cleaning", () => {
  it("bounds name and message, strips control characters and line breaks from one-line fields", () => {
    const f = cleanFinderFields({
      name: `Marta\nTel: 999\u0000${"x".repeat(200)}`,
      phone: " 123\t456 ",
      email: 42,
      message: `line 1\r\nline 2\u0007${"y".repeat(600)}`,
    });
    expect(f.name.startsWith("Marta Tel: 999 x")).toBe(true);
    expect(f.name).toHaveLength(80);
    expect(f.phone).toBe("123 456");
    expect(f.email).toBe("");
    expect(f.message.startsWith("line 1\nline 2 y")).toBe(true);
    expect(f.message.length).toBeLessThanOrEqual(500);
  });

  it("accepts an older page's body (message only) and checks a current one", () => {
    expect(parseFinderSubmission({ message: "hi" }).error).toBeNull();
    expect(parseFinderSubmission({}).error).toBeNull();
    expect(parseFinderSubmission(null).error).toBeNull();
    expect(parseFinderSubmission({ message: "hi", finderName: "Marta" }).error).toBe("contact_required");
    expect(parseFinderSubmission({ finderPhone: "123456" }).error).toBeNull();
  });

  it("writes the contact before the message", () => {
    expect(composeFinderText({ name: "Marta", phone: "123456", email: "", message: "hi" })).toBe("Marta\nTel: 123456\nhi");
    expect(composeFinderText({ message: "hi" })).toBe("hi");
  });
});

describe("links", () => {
  it("builds tel: from digits only and refuses what cannot be dialled", () => {
    expect(telHref("+54 (9) 11 5555-0101")).toBe("tel:+5491155550101");
    expect(telHref("11 5555")).toBe("tel:115555");
    expect(telHref("no phone")).toBeNull();
  });
  it("builds mailto: only for a plain address", () => {
    expect(mailtoHref("a@example.test")).toBe("mailto:a@example.test");
    expect(mailtoHref("a@example.test?subject=x")).toBeNull();
  });
});

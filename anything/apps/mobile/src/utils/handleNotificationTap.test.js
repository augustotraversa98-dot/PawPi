const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...a) => mockPush(...a) } }));

import { handleNotificationTap } from "./handleNotificationTap";

beforeEach(() => mockPush.mockClear());

test("a reminder tap pushes Health ONCE, on the section that holds the reminder", () => {
  handleNotificationTap({ type: "feeding", reminderId: "r1" });
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/(tabs)/health", params: { section: "today" } });

  mockPush.mockClear();
  handleNotificationTap({ type: "vet_appointment", reminderId: "r2" });
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/(tabs)/health", params: { section: "vet-record" } });
});

test("an unknown type still pushes exactly once (no duplicate stack entry)", () => {
  handleNotificationTap({ type: "mystery", reminderId: "r3" });
  expect(mockPush).toHaveBeenCalledTimes(1);
});

test("ignores a missing notification", () => {
  handleNotificationTap(null);
  expect(mockPush).not.toHaveBeenCalled();
});

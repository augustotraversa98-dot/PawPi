import { describe, it, expect } from "vitest";

import {
  CHANNEL_CLASS,
  BUSINESS_NOTIFICATION_CATEGORIES,
  channelClassForType,
  businessCategoryForType,
  categoryDefaultEnabled,
  isBusinessNotificationCategory,
} from "./notificationCategories";

describe("BN2 business notification catalog", () => {
  it("toggleable categories are the PUSH + OPTIONAL_PUSH ones (no IN_APP_ONLY)", () => {
    expect(BUSINESS_NOTIFICATION_CATEGORIES).toEqual([
      "walk_requests",
      "biz_booking",
      "biz_booking_change",
      "biz_order",
      "biz_message",
      "biz_adoption_application",
      "biz_review",
      "biz_payout",
    ]);
    expect(BUSINESS_NOTIFICATION_CATEGORIES).not.toContain("biz_post_engagement");
    expect(BUSINESS_NOTIFICATION_CATEGORIES).not.toContain("biz_follow");
  });

  it("channelClassForType maps each type to its class; unknown → IN_APP_ONLY", () => {
    expect(channelClassForType("biz_booking")).toBe(CHANNEL_CLASS.PUSH);
    expect(channelClassForType("walk_request_targeted")).toBe(CHANNEL_CLASS.PUSH);
    expect(channelClassForType("biz_review")).toBe(CHANNEL_CLASS.OPTIONAL_PUSH);
    expect(channelClassForType("biz_payout")).toBe(CHANNEL_CLASS.OPTIONAL_PUSH);
    expect(channelClassForType("biz_post_engagement")).toBe(CHANNEL_CLASS.IN_APP_ONLY);
    expect(channelClassForType("biz_follow")).toBe(CHANNEL_CLASS.IN_APP_ONLY);
    // A pet-owner type is un-cataloged → never pushes.
    expect(channelClassForType("booking_confirmed")).toBe(CHANNEL_CLASS.IN_APP_ONLY);
    expect(channelClassForType("paw")).toBe(CHANNEL_CLASS.IN_APP_ONLY);
  });

  it("businessCategoryForType keeps walk_request_* on the legacy walk_requests key", () => {
    expect(businessCategoryForType("walk_request_targeted")).toBe("walk_requests");
    expect(businessCategoryForType("walk_request_broadcast")).toBe("walk_requests");
    expect(businessCategoryForType("biz_order")).toBe("biz_order");
    expect(businessCategoryForType("paw")).toBeNull();
  });

  it("categoryDefaultEnabled: PUSH → true, OPTIONAL_PUSH → false", () => {
    expect(categoryDefaultEnabled("walk_requests")).toBe(true);
    expect(categoryDefaultEnabled("biz_booking")).toBe(true);
    expect(categoryDefaultEnabled("biz_review")).toBe(false);
    expect(categoryDefaultEnabled("biz_payout")).toBe(false);
  });

  it("isBusinessNotificationCategory validates the toggleable set", () => {
    expect(isBusinessNotificationCategory("biz_booking")).toBe(true);
    expect(isBusinessNotificationCategory("biz_follow")).toBe(false); // info-only
    expect(isBusinessNotificationCategory("made_up")).toBe(false);
  });
});

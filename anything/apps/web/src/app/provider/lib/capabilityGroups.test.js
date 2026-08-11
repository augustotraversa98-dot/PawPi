import { describe, it, expect } from "vitest";
import { CAPABILITY_OPTIONS } from "./capabilities";
import {
  groupedCapabilityOptions,
  sectionForCapability,
  SECTION_ORDER,
} from "./capabilityGroups";

// Ticket 2.89 — the offering picker is grouped under a few clear parent sections. This is
// labels + grouping only: NO capability key is created, renamed, or removed.

describe("capabilityGroups", () => {
  it("covers every capability exactly once, adding/dropping none", () => {
    const grouped = groupedCapabilityOptions();
    const flattened = grouped.flatMap((g) => g.options.map((o) => o.value));

    const source = CAPABILITY_OPTIONS.map((o) => o.value);
    // Same set, same count — nothing invented, nothing lost, no duplicates.
    expect([...flattened].sort()).toEqual([...source].sort());
    expect(flattened).toHaveLength(source.length);
  });

  it("preserves each option's original label (grouping is presentation-only)", () => {
    const grouped = groupedCapabilityOptions();
    for (const { options } of grouped) {
      for (const opt of options) {
        const original = CAPABILITY_OPTIONS.find((o) => o.value === opt.value);
        expect(opt.label).toBe(original.label);
      }
    }
  });

  it("places the recommended leaves under the right sections", () => {
    expect(sectionForCapability("vet")).toBe("Veterinary & Health");
    expect(sectionForCapability("telehealth")).toBe("Veterinary & Health");
    expect(sectionForCapability("groomer")).toBe("Veterinary & Health");
    expect(sectionForCapability("pharmacy")).toBe("Veterinary & Health");
    expect(sectionForCapability("walker")).toBe("Walking & Sitting");
    expect(sectionForCapability("sitter")).toBe("Walking & Sitting");
    expect(sectionForCapability("daycare")).toBe("Walking & Sitting");
    expect(sectionForCapability("trainer")).toBe("Training");
    expect(sectionForCapability("shop")).toBe("Store");
    expect(sectionForCapability("adoption")).toBe("Adoption");
    expect(sectionForCapability("transport")).toBe("Other");
    expect(sectionForCapability("insurance")).toBe("Other");
  });

  it("renders sections in the declared order and omits empty ones", () => {
    const grouped = groupedCapabilityOptions();
    const sections = grouped.map((g) => g.section);
    // Every rendered section is a known one, in SECTION_ORDER order.
    const expectedOrder = SECTION_ORDER.filter((s) => sections.includes(s));
    expect(sections).toEqual(expectedOrder);
    // No empty groups.
    expect(grouped.every((g) => g.options.length > 0)).toBe(true);
  });

  it("falls an unknown capability into Other (never dropped)", () => {
    expect(sectionForCapability("some-future-cap")).toBe("Other");
  });
});

import * as Localization from "expo-localization";

// Metric by default (Argentina and most of the world use kg). Only locales whose
// measurement system is "us" start on lbs; lbs stays selectable wherever a weight
// is entered. Use for NEW entries — an existing record keeps its own stored unit.
export function defaultWeightUnit() {
  try {
    const system = Localization.getLocales?.()?.[0]?.measurementSystem;
    return system === "us" ? "lbs" : "kg";
  } catch {
    return "kg";
  }
}

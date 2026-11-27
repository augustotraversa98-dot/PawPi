/**
 * Apple Health / Apple Watch integration placeholder
 *
 * This module provides stubs for HealthKit integration.
 * When HealthKit is fully supported, replace these with real implementations.
 *
 * For now, these functions return mock data or indicate availability.
 */

import { Platform, Alert } from "react-native";
import { gt } from "@/utils/generatedCopy";

// Check if HealthKit is available on this device
export async function isHealthKitAvailable() {
  // HealthKit is only available on iOS
  if (Platform.OS !== "ios") {
    return false;
  }

  // TODO: When HealthKit is integrated, check actual availability
  // For now, return false to indicate it's not yet implemented
  return false;
}

// Check if Apple Watch is connected
export async function isAppleWatchConnected() {
  if (Platform.OS !== "ios") {
    return false;
  }

  // TODO: Check WatchConnectivity framework
  return false;
}

// Request HealthKit permissions
export async function requestHealthKitPermission() {
  if (Platform.OS !== "ios") {
    Alert.alert(
      gt("generatedUi.healthKit.notAvailableTitle", "Not Available"),
      gt(
        "generatedUi.healthKit.notAvailableBody",
        "Apple Health is only available on iOS devices.",
      ),
    );
    return false;
  }

  // Show rationale
  return new Promise((resolve) => {
    Alert.alert(
      gt("generatedUi.healthKit.accessTitle", "Apple Health Access"),
      gt(
        "generatedUi.healthKit.accessBody",
        "PawPi can use walk distance and activity data to help keep your pet's walk history accurate.",
      ),
      [
        {
          text: gt("generatedUi.healthKit.notNow", "Not now"),
          style: "cancel",
          onPress: () => resolve(false),
        },
        {
          text: gt("generatedUi.healthKit.allow", "Allow"),
          onPress: () => {
            // TODO: Request actual HealthKit permissions
            // For now, show placeholder message
            Alert.alert(
              gt("generatedUi.healthKit.comingSoonTitle", "Coming Soon"),
              gt(
                "generatedUi.healthKit.comingSoonBody",
                "Apple Health integration is coming soon. For now, use manual tracking.",
              ),
            );
            resolve(false);
          },
        },
      ],
    );
  });
}

// Get walk data from Apple Health / Watch for a specific time period
export async function getWalkData(startTime, endTime) {
  // TODO: Query HealthKit for:
  // - Distance (HKQuantityTypeIdentifier.distanceWalkingRunning)
  // - Steps (HKQuantityTypeIdentifier.stepCount)
  // - Average speed (calculated from distance / time)
  // - Active energy burned
  // - Heart rate (if available from Watch)

  // Placeholder return
  return {
    available: false,
    distance: null,
    distanceUnit: "km",
    steps: null,
    averageSpeed: null,
    pace: null,
    source: "manual",
    sourceDevice: null,
  };
}

// Get current tracking preference
export function getTrackingPreference() {
  // TODO: Load from async storage or user settings
  // Options: 'manual', 'apple_health', 'apple_watch'
  return "manual";
}

// Set tracking preference
export async function setTrackingPreference(preference) {
  // TODO: Save to async storage or user settings
  console.log("[HealthKit] Setting tracking preference:", preference);

  if (preference === "apple_health" || preference === "apple_watch") {
    const hasPermission = await requestHealthKitPermission();
    if (!hasPermission) {
      return false;
    }
  }

  // TODO: Persist preference
  return true;
}

// Get tracking source display name
export function getTrackingSourceDisplay(source) {
  switch (source) {
    case "apple_health":
      return gt("generatedUi.healthKit.trackedAppleHealth", "Tracked with Apple Health");
    case "apple_watch":
      return gt("generatedUi.healthKit.trackedAppleWatch", "Tracked with Apple Watch");
    case "gps":
      return gt("generatedUi.healthKit.trackedGps", "Tracked with GPS");
    case "manual":
    default:
      return gt("generatedUi.healthKit.trackedManual", "Tracked manually");
  }
}

// Get tracking source icon
export function getTrackingSourceIcon(source) {
  switch (source) {
    case "apple_health":
      return "❤️"; // Apple Health heart icon
    case "apple_watch":
      return "⌚"; // Apple Watch icon
    case "gps":
      return "📍"; // GPS pin icon
    case "manual":
    default:
      return "✏️"; // Manual pencil icon
  }
}

// Format distance for display
export function formatDistance(distance) {
  if (!distance) return null;
  return `${distance.toFixed(2)} km`;
}

// Format steps for display
export function formatSteps(steps) {
  if (!steps) return null;
  return gt("generatedUi.healthKit.steps", `${steps.toLocaleString()} steps`, {
    steps: steps.toLocaleString(),
  });
}

// Format pace for display
export function formatPace(pace) {
  if (!pace) return null;
  return `${pace} min/km`;
}

// Calculate pace from distance and duration
export function calculatePace(distanceKm, durationMinutes) {
  if (!distanceKm || !durationMinutes || distanceKm === 0) {
    return null;
  }

  // Pace = minutes per kilometre
  const paceMinPerKm = durationMinutes / distanceKm;
  const minutes = Math.floor(paceMinPerKm);
  const seconds = Math.round((paceMinPerKm - minutes) * 60);

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// Calculate average speed (km/h)
export function calculateAverageSpeed(distanceKm, durationMinutes) {
  if (!distanceKm || !durationMinutes || durationMinutes === 0) {
    return null;
  }

  // Speed = distance / time (in hours)
  const speedKmh = distanceKm / (durationMinutes / 60);
  return parseFloat(speedKmh.toFixed(2));
}

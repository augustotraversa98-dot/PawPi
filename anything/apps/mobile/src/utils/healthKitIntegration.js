/**
 * Apple Health / Apple Watch integration placeholder
 *
 * This module provides stubs for HealthKit integration.
 * When HealthKit is fully supported, replace these with real implementations.
 *
 * For now, these functions return mock data or indicate availability.
 */

import { Platform, Alert } from "react-native";

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
      "Not Available",
      "Apple Health is only available on iOS devices.",
    );
    return false;
  }

  // Show rationale
  return new Promise((resolve) => {
    Alert.alert(
      "Apple Health Access",
      "Social Pet can use walk distance and activity data to help keep your pet's walk history accurate.",
      [
        {
          text: "Not now",
          style: "cancel",
          onPress: () => resolve(false),
        },
        {
          text: "Allow",
          onPress: () => {
            // TODO: Request actual HealthKit permissions
            // For now, show placeholder message
            Alert.alert(
              "Coming Soon",
              "Apple Health integration is coming soon. For now, use manual tracking.",
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
    distanceUnit: "miles",
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
      return "Tracked with Apple Health";
    case "apple_watch":
      return "Tracked with Apple Watch";
    case "gps":
      return "Tracked with GPS";
    case "manual":
    default:
      return "Tracked manually";
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
export function formatDistance(distance, unit = "miles") {
  if (!distance) return null;

  if (unit === "miles") {
    return `${distance.toFixed(2)} mi`;
  } else if (unit === "kilometers") {
    return `${distance.toFixed(2)} km`;
  }

  return `${distance.toFixed(2)} ${unit}`;
}

// Format steps for display
export function formatSteps(steps) {
  if (!steps) return null;
  return `${steps.toLocaleString()} steps`;
}

// Format pace for display
export function formatPace(pace, unit = "miles") {
  if (!pace) return null;

  if (unit === "miles") {
    return `${pace} min/mi`;
  } else if (unit === "kilometers") {
    return `${pace} min/km`;
  }

  return pace;
}

// Convert miles to kilometers
export function milesToKilometers(miles) {
  return miles * 1.60934;
}

// Convert kilometers to miles
export function kilometersToMiles(kilometers) {
  return kilometers * 0.621371;
}

// Calculate pace from distance and duration
export function calculatePace(distanceMiles, durationMinutes) {
  if (!distanceMiles || !durationMinutes || distanceMiles === 0) {
    return null;
  }

  // Pace = minutes per mile
  const paceMinPerMile = durationMinutes / distanceMiles;
  const minutes = Math.floor(paceMinPerMile);
  const seconds = Math.round((paceMinPerMile - minutes) * 60);

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// Calculate average speed (mph or km/h)
export function calculateAverageSpeed(distanceMiles, durationMinutes) {
  if (!distanceMiles || !durationMinutes || durationMinutes === 0) {
    return null;
  }

  // Speed = distance / time (in hours)
  const speedMph = distanceMiles / (durationMinutes / 60);
  return parseFloat(speedMph.toFixed(2));
}

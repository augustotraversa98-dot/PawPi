import { decimalToInput } from "@/utils/decimal";

// Distances are shown in kilometres everywhere. Tracked routes are measured in metres.
export function metresToKm(metres) {
  if (metres == null) return null;
  return Math.round(Number(metres) / 10) / 100;
}

// "1,25 km" in Spanish, "1.25 km" in English; null when there is no distance.
export function formatKmFromMetres(metres) {
  const km = metresToKm(metres);
  return km == null ? null : `${decimalToInput(km)} km`;
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { alertError, alertText } from "@/utils/appAlert";
import { isValidCoord } from "@/utils/walkBuddies";

// Lost & Found (ticket 2.48): lost mode, near-me browse, sightings, resolve.

// Browse active alerts (optional device location → bounding box).
export function useLostReports(location) {
  const hasLoc = !!location && isValidCoord(location.lat, location.lng);
  return useQuery({
    queryKey: ["lost-reports", hasLoc ? `${location.lat},${location.lng}` : null],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (hasLoc) {
        params.set("lat", String(location.lat));
        params.set("lng", String(location.lng));
        params.set("radiusKm", "25");
      }
      const res = await fetch(`/api/lost-reports?${params}`);
      if (!res.ok) throw new Error("Failed to load");
      return (await res.json()).reports || [];
    },
  });
}

// The caller's own reports (to show a pet's lost badge + the resolve action).
export function useMyLostReports() {
  return useQuery({
    queryKey: ["my-lost-reports"],
    queryFn: async () => {
      const res = await fetch("/api/lost-reports?mine=true");
      if (!res.ok) throw new Error("Failed to load");
      return (await res.json()).reports || [];
    },
  });
}

// A report + its sightings.
export function useLostReport(reportId) {
  return useQuery({
    queryKey: ["lost-report", reportId],
    queryFn: async () => {
      const res = await fetch(`/api/lost-reports/${reportId}`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json(); // { report, sightings }
    },
    enabled: !!reportId,
  });
}

export function useMarkLost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res = await fetch("/api/lost-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Failed to mark lost");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lost-reports"] });
      qc.invalidateQueries({ queryKey: ["my-lost-reports"] });
      alertText("appAlerts.lostModeOnTitle", "appAlerts.lostModeOnBody");
    },
    onError: (e) => alertError(e, "appAlerts.couldNotMarkLost"),
  });
}

export function useReportSighting(reportId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ note, lat, lng, photoUrl }) => {
      const res = await fetch(`/api/lost-reports/${reportId}/sightings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, lat, lng, photoUrl }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Failed to report");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lost-report", reportId] });
      alertText("appAlerts.sightingThanksTitle", "appAlerts.sightingThanksBody");
    },
    onError: (e) => alertError(e, "appAlerts.couldNotReportSighting"),
  });
}

export function useResolveLost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reportId) => {
      const res = await fetch(`/api/lost-reports/${reportId}/resolve`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to resolve");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lost-reports"] });
      qc.invalidateQueries({ queryKey: ["my-lost-reports"] });
      alertText("appAlerts.welcomeHomeTitle", "appAlerts.welcomeHomeBody");
    },
    onError: (e) => alertError(e, "appAlerts.couldNotResolve"),
  });
}

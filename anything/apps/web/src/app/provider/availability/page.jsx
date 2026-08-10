import { Navigate } from "react-router";

// /provider/availability — the open-hours editor moved into the Business Profile ("Open hours"
// section) in Phase 2, and this nav item was removed. Redirect any bookmarked/old link to the
// Profile so it never dead-ends.
export default function ProviderAvailabilityPage() {
  return <Navigate to="/provider/profile" replace />;
}

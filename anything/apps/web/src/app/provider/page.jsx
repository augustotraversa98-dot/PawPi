import { Navigate } from "react-router";

// /provider — the provider dashboard entry point. The only working section this
// ticket (c1) is the bookings inbox, so redirect there. Future sections (profile,
// services, staff → c2; clinical → c3) get their own routes later.
export default function ProviderIndexPage() {
  return <Navigate to="/provider/bookings" replace />;
}

import { Heart, Activity, TrendingUp, FileText } from "lucide-react-native";

// The Health tab's section strip. Lives outside the route file so the visible set can be
// unit-tested without rendering the whole tab.
//
// Insights is hidden for now (AUDIT_2026-09 A-13): HealthInsights renders hard-coded sample
// stats and insights ("Lower appetite — 2 days this week…") that are not derived from the
// pet's logs, which violates the no-mock-data rule and misleads owners. The component,
// its i18n keys and the `?section=insights` deep link are all kept intact — flip this to
// `true` once Insights is built on real queries (same pattern as SHOW_NUTRITION, #516).
export const SHOW_INSIGHTS = false;

const ALL_SECTIONS = [
  { id: "today", labelKey: "health.today", icon: Heart },
  { id: "track", labelKey: "health.track", icon: Activity },
  { id: "insights", labelKey: "health.insights", icon: TrendingUp },
  { id: "vet-record", labelKey: "health.vetRecord.title", icon: FileText },
];

export const HEALTH_SECTIONS = ALL_SECTIONS.filter(
  (s) => s.id !== "insights" || SHOW_INSIGHTS,
);

export const HEALTH_SECTION_IDS = new Set(HEALTH_SECTIONS.map((s) => s.id));

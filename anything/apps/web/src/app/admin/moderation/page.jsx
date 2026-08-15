import ModerationConsole from "./ModerationConsole";

// /admin/moderation — MOD1 PR2 moderation console (Apple Guideline 1.2). The page is a thin shell;
// all data + gating live in <ModerationConsole/>, whose only data source is the admin-only
// GET /api/admin/reports (app_is_admin gate, 0065/0114). A non-admin who navigates here gets a
// bare "no access" state with NO report data.
export default function AdminModerationPage() {
  return <ModerationConsole />;
}

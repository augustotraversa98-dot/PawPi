import { describe, it, expect, vi, beforeEach } from "vitest";

// MOD1 PR1 — alertAdminsOfReport: bell + rate-limited email to every admin on a new report,
// best-effort and non-throwing.

import { alertAdminsOfReport } from "./adminAlert";
import sql from "@/app/api/utils/sql";
import { safeNotify } from "@/app/api/utils/notify";
import { sendEmail } from "@/app/api/utils/email";

vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/notify", () => ({ safeNotify: vi.fn() }));
vi.mock("@/app/api/utils/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/app/api/utils/passwordResetToken", () => ({
  resolveAppOrigin: () => "https://pawpi.info",
}));

const REPORT = { id: 99, target_type: "post", target_id: 5, reason: "spam", details: "x" };
const ALLOWED = [{ allowed: true }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("alertAdminsOfReport", () => {
  it("bells AND emails every admin (bell is a reporter-less system notification)", async () => {
    sql.mockResolvedValueOnce([
      { user_id: 3, email: "a@example.com" },
      { user_id: 4, email: "b@example.com" },
    ]);
    sql.mockResolvedValue(ALLOWED); // rate-limit checks

    await alertAdminsOfReport({ report: REPORT, reporterId: 7 });

    expect(safeNotify).toHaveBeenCalledTimes(2);
    // actor null ⇒ system alert, never leaks the reporter to the moderator queue.
    expect(safeNotify).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: 3, actor: null, type: "report_received", subjectRef: "99" }),
    );
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail.mock.calls[0][0].subject).toContain("post");
    expect(sendEmail.mock.calls[0][0].text).toContain("/admin/moderation");
    // The reporter must never appear in the email body.
    expect(sendEmail.mock.calls[0][0].text).not.toContain("7");
  });

  it("no admins → no bell, no email, no throw", async () => {
    sql.mockResolvedValueOnce([]);
    await alertAdminsOfReport({ report: REPORT, reporterId: 7 });
    expect(safeNotify).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("an admin with no email still gets the in-app bell (email skipped)", async () => {
    sql.mockResolvedValueOnce([{ user_id: 3, email: null }]);
    sql.mockResolvedValue(ALLOWED);
    await alertAdminsOfReport({ report: REPORT, reporterId: 7 });
    expect(safeNotify).toHaveBeenCalledTimes(1);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("a rate-limited admin is skipped for email but still belled", async () => {
    sql.mockResolvedValueOnce([{ user_id: 3, email: "a@example.com" }]);
    sql.mockResolvedValueOnce([{ allowed: false }]); // over the per-admin email cap
    await alertAdminsOfReport({ report: REPORT, reporterId: 7 });
    expect(safeNotify).toHaveBeenCalledTimes(1);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("degrades clean when unmigrated (app_admin_recipients missing) — no throw", async () => {
    const err = Object.assign(new Error("function app_admin_recipients() does not exist"), {
      code: "42883",
    });
    sql.mockRejectedValueOnce(err);
    await expect(
      alertAdminsOfReport({ report: REPORT, reporterId: 7 }),
    ).resolves.toBeUndefined();
    expect(safeNotify).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("never throws even if the recipients read errors unexpectedly", async () => {
    sql.mockRejectedValueOnce(new Error("boom"));
    await expect(
      alertAdminsOfReport({ report: REPORT, reporterId: 7 }),
    ).resolves.toBeUndefined();
  });

  it("ignores a report with no id (nothing to alert on)", async () => {
    await alertAdminsOfReport({ report: { id: null }, reporterId: 7 });
    expect(sql).not.toHaveBeenCalled();
    expect(safeNotify).not.toHaveBeenCalled();
  });
});

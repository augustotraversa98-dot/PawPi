import { describe, it, expect, vi, beforeEach } from "vitest";
import sql from "@/app/api/utils/sql";
import {
  isDmThreadParticipant,
  isMessageThreadParticipant,
} from "./messagingAccess";

vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe("isDmThreadParticipant (AUDIT A-22)", () => {
  it("true when the query returns a row", async () => {
    sql.mockResolvedValueOnce([{ "?column?": 1 }]);
    expect(await isDmThreadParticipant(7, "3")).toBe(true);
    const q = sql.mock.calls[0][0].join(" ");
    expect(q).toContain("FROM dm_threads");
    expect(q).toContain("user_a_id");
    expect(q).toContain("user_b_id");
  });
  it("false when there is no participant row", async () => {
    sql.mockResolvedValueOnce([]);
    expect(await isDmThreadParticipant(7, "3")).toBe(false);
  });
});

describe("isMessageThreadParticipant (AUDIT A-22)", () => {
  it("true when owner or active staff", async () => {
    sql.mockResolvedValueOnce([{ "?column?": 1 }]);
    expect(await isMessageThreadParticipant(7, "9")).toBe(true);
    const q = sql.mock.calls[0][0].join(" ");
    expect(q).toContain("FROM message_threads");
    expect(q).toContain("provider_staff");
    expect(q).toContain("owner_user_id");
  });
  it("false for a non-participant", async () => {
    sql.mockResolvedValueOnce([]);
    expect(await isMessageThreadParticipant(7, "9")).toBe(false);
  });
});

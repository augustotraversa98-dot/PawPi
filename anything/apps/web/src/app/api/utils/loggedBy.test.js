import { describe, it, expect, vi, beforeEach } from "vitest";
import sql from "./sql";
import { withLoggedByNames } from "./loggedBy";

vi.mock("./sql", () => ({ default: vi.fn() }));
vi.mock("./requestContext", () => ({ withSavepoint: (fn) => fn() }));

beforeEach(() => vi.clearAllMocks());

it("adds the public display name only and strips the ids", async () => {
  sql.mockResolvedValueOnce([{ id: 2, full_name: "  Sam Rivera " }, { id: 3, full_name: "" }]);
  const out = await withLoggedByNames([
    { id: 10, logged_by_user_id: 2, logged_by_known: true },
    { id: 11, logged_by_user_id: 3, logged_by_known: true }, // no public name
    { id: 12, logged_by_user_id: null, logged_by_known: true }, // account gone
    { id: 13, logged_by_user_id: null, logged_by_known: false }, // older entry
  ]);
  expect(out).toEqual([
    { id: 10, logged_by_name: "Sam Rivera" },
    { id: 11 },
    { id: 12, logged_by_name: "Former member" },
    { id: 13 },
  ]);
});

it("before the migration the rows pass through untouched, with no extra query", async () => {
  const rows = [{ id: 1, notes: "a" }];
  expect(await withLoggedByNames(rows)).toEqual(rows);
  expect(sql).not.toHaveBeenCalled();
});

it("a failed name lookup never fails the read", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  sql.mockRejectedValueOnce(new Error("boom"));
  expect(await withLoggedByNames([{ id: 1, logged_by_user_id: 2, logged_by_known: true }])).toEqual([
    { id: 1 }, // never claims the author is gone
  ]);
});

import { queryClient } from "./queryClient";

// AUDIT_2026-09 A-06: offline must FAIL CLOSED. With the default `networkMode:'online'` an
// offline query sits paused (`isLoading=false`, `data=undefined` → screens show their empty
// state) and an offline mutation leaves its button spinning forever. `offlineFirst` runs the
// request once so it fails fast into the existing error states, and resumes retries when
// connectivity returns.
test("queries and mutations use offlineFirst network mode", () => {
  const { queries, mutations } = queryClient.getDefaultOptions();
  expect(queries.networkMode).toBe("offlineFirst");
  expect(mutations.networkMode).toBe("offlineFirst");
});

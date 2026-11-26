// useShareRecord: sends only the chosen sections and length, and never reports "shared" unless the grant that comes
// back is exactly that. A server that cannot share by section answers with a wider grant, which is revoked.

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useShareRecord } from "./useCareAccessGrants";

const choice = { petId: 7, providerId: 3, sections: ["vaccines"], expiry: "until_revoked" };
const sectioned = {
  id: 90,
  status: "active",
  scopes: ["record_sections"],
  sections: ["vaccines"],
  expires_at: null,
};
// What a server without sections answers to the same request: the older bundle, no end date.
const older = { id: 91, status: "active", scopes: ["medical_read"], expires_at: null };

const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

function setup(...replies) {
  global.fetch = jest.fn();
  replies.forEach((r) =>
    global.fetch.mockImplementationOnce(async () => {
      if (r instanceof Error) throw r;
      return r;
    }),
  );
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = jest.spyOn(client, "invalidateQueries");
  const onSuccess = jest.fn();
  const onError = jest.fn();
  const hook = renderHook(() => useShareRecord({ onSuccess, onError }), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  return { ...hook, onSuccess, onError, invalidate };
}

const run = async (result, vars = choice) => {
  let value;
  await act(async () => {
    value = await result.current.mutateAsync(vars);
  });
  return value;
};

const calls = () => global.fetch.mock.calls.map(([url, init]) => [url, init.method, JSON.parse(init.body)]);

afterEach(() => jest.restoreAllMocks());

test("posts only petId, providerId, sections and expiry (no scopes), and reports shared", async () => {
  const { result, invalidate } = setup(reply({ grant: sectioned }, 201));
  const value = await run(result, { ...choice, providerName: "Happy Paws" });
  expect(value.outcome).toBe("shared");
  expect(calls()).toEqual([["/api/care-access/grants", "POST", choice]]);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["care-access-grants", 7] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["care-access-grants", "all"] });
});

test("an approved pending request with exactly the choice is shared", async () => {
  const { result } = setup(reply({ grant: sectioned, approvedRequest: true }));
  expect((await run(result)).outcome).toBe("shared");
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test("a server that ignores the sections: the new wider grant is revoked", async () => {
  const { result } = setup(reply({ grant: older }, 201), reply({ grant: { ...older, status: "revoked" } }));
  const value = await run(result);
  expect(value.outcome).toBe("rolledBack");
  expect(calls()[1]).toEqual(["/api/care-access/grants/91", "PATCH", { action: "revoke" }]);
});

test.each([
  ["more sections", { ...sectioned, sections: ["vaccines", "insurance"] }],
  ["an extra scope", { ...sectioned, scopes: ["record_sections", "medical_read"] }],
  ["another end date", { ...sectioned, expires_at: "2999-01-01T00:00:00Z" }],
])("a grant with %s is revoked too", async (_name, grant) => {
  const { result } = setup(reply({ grant }, 201), reply({ grant }));
  expect((await run(result)).outcome).toBe("rolledBack");
});

test("an approved request that came back wider is revoked", async () => {
  const { result } = setup(reply({ grant: older, approvedRequest: true }), reply({ grant: older }));
  expect((await run(result)).outcome).toBe("rolledBack");
});

test.each([
  ["is refused", reply({ error: "no" }, 500)],
  ["never arrives", new Error("Network request failed")],
])("when the revoke %s the result says the grant is still there", async (_name, revoke) => {
  const { result } = setup(reply({ grant: older }, 201), revoke);
  const value = await run(result);
  expect(value).toEqual({ outcome: "rollbackFailed", grant: older });
});

test("access that already existed (deduped) is reported, not revoked on the owner's behalf", async () => {
  const { result } = setup(reply({ grant: older, deduped: true }));
  expect((await run(result)).outcome).toBe("unchanged");
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test("a grant that gives no access is not reported as shared", async () => {
  const { result } = setup(reply({ grant: { ...older, status: "pending" }, deduped: true }));
  expect((await run(result)).outcome).toBe("notApplied");
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test.each([
  ["an empty body", reply({}, 200)],
  ["an unreadable body", { ok: true, status: 200, json: async () => Promise.reject(new Error("bad json")) }],
])("%s is unconfirmed", async (_name, answer) => {
  const { result } = setup(answer);
  expect((await run(result)).outcome).toBe("unconfirmed");
});

test.each([400, 404, 409, 500])("a %i answer throws with its status and revokes nothing", async (status) => {
  const { result, onError, onSuccess } = setup(reply({ error: "refused" }, status));
  await act(async () => {
    await expect(result.current.mutateAsync(choice)).rejects.toMatchObject({ status });
  });
  await waitFor(() => expect(onError).toHaveBeenCalled());
  expect(onSuccess).not.toHaveBeenCalled();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test("the check and the revoke still run when the screen is closed during the request", async () => {
  let answer;
  const { result, unmount, onSuccess } = setup();
  global.fetch
    .mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
    .mockImplementationOnce(async () => reply({ grant: older }));
  act(() => {
    result.current.mutate(choice);
  });
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  unmount();
  await act(async () => {
    answer(reply({ grant: older }, 201));
  });
  await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  expect(onSuccess.mock.calls[0][0].outcome).toBe("rolledBack");
  expect(calls()[1][1]).toBe("PATCH");
});

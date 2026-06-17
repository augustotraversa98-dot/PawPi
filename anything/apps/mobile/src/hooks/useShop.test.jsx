// Contract for the owner-facing SHOP hooks (ticket 2.11):
//   - useShopProducts keys on ["shop-products", providerId], is disabled with no id,
//     hits /api/providers/[id]/shop-products, returns products[];
//   - useShopCheckout POSTs to /api/pets/[id]/shop-checkout with the body (petId stripped),
//     surfaces the backend error (out-of-stock / Rx / not-configured), returns the result;
//   - useShopSubscriptions / useCreateShopSubscription / useUpdateShopSubscription hit the
//     /api/shop/subscriptions endpoints and surface errors;
//   - useShopOrders hits /api/shop/orders and returns orders[].
// fetch is mocked; no network, no DB.

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useShopProducts,
  useShopCheckout,
  useShopOrders,
  useShopSubscriptions,
  useCreateShopSubscription,
  useUpdateShopSubscription,
} from "./useProviders";

function makeWrapper(queryClient) {
  return function Wrapper({ children }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function lastFetchUrl() {
  const calls = global.fetch.mock.calls;
  return calls[calls.length - 1][0];
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useShopProducts", () => {
  test("disabled until a providerId is known (no fetch)", async () => {
    global.fetch = jest.fn();
    const { result } = renderHook(() => useShopProducts(undefined), {
      wrapper: makeWrapper(makeClient()),
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("fetches a shop's catalog and returns the array", async () => {
    const products = [{ id: 9, name: "Kibble", price_cents: 5000 }];
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ products }) }));
    const { result } = renderHook(() => useShopProducts(100), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastFetchUrl()).toBe("/api/providers/100/shop-products");
    expect(result.current.data).toBe(products);
  });
});

describe("useShopCheckout", () => {
  test("POSTs the cart to the pet's shop-checkout (petId stripped from body)", async () => {
    const out = { order: { id: 1 }, checkoutUrl: "https://pay/x" };
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => out }));
    const { result } = renderHook(() => useShopCheckout(), {
      wrapper: makeWrapper(makeClient()),
    });
    let res;
    await act(async () => {
      res = await result.current.mutateAsync({
        petId: 55,
        provider_id: 100,
        items: [{ product_id: 9, quantity: 2 }],
        rail: "mercadopago",
      });
    });
    expect(lastFetchUrl()).toBe("/api/pets/55/shop-checkout");
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.petId).toBeUndefined();
    expect(body.provider_id).toBe(100);
    expect(res).toEqual(out);
  });

  test("surfaces the backend error (e.g. out of stock)", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      json: async () => ({ error: "Out of stock: Kibble" }),
    }));
    const { result } = renderHook(() => useShopCheckout(), {
      wrapper: makeWrapper(makeClient()),
    });
    await expect(
      act(async () => {
        await result.current.mutateAsync({
          petId: 55,
          provider_id: 100,
          items: [{ product_id: 9 }],
          rail: "mercadopago",
        });
      }),
    ).rejects.toThrow(/out of stock/i);
  });
});

describe("useShopOrders", () => {
  test("fetches the owner's order history", async () => {
    const orders = [{ id: 1, kind: "product" }];
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ orders }) }));
    const { result } = renderHook(() => useShopOrders(), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastFetchUrl()).toBe("/api/shop/orders");
    expect(result.current.data).toBe(orders);
  });
});

describe("useShopSubscriptions + mutations", () => {
  test("lists the owner's subscriptions", async () => {
    const subscriptions = [{ id: 1, plan: "monthly" }];
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ subscriptions }),
    }));
    const { result } = renderHook(() => useShopSubscriptions(), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastFetchUrl()).toBe("/api/shop/subscriptions");
    expect(result.current.data).toBe(subscriptions);
  });

  test("create POSTs to /api/shop/subscriptions", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ subscription: { id: 1 } }),
    }));
    const { result } = renderHook(() => useCreateShopSubscription(), {
      wrapper: makeWrapper(makeClient()),
    });
    await act(async () => {
      await result.current.mutateAsync({ product_id: 9, plan: "monthly", quantity: 2 });
    });
    expect(lastFetchUrl()).toBe("/api/shop/subscriptions");
    expect(global.fetch.mock.calls[0][1].method).toBe("POST");
  });

  test("update PATCHes a subscription to cancelled", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ subscription: { id: 1, status: "cancelled" } }),
    }));
    const { result } = renderHook(() => useUpdateShopSubscription(), {
      wrapper: makeWrapper(makeClient()),
    });
    await act(async () => {
      await result.current.mutateAsync({ id: 1, status: "cancelled" });
    });
    expect(lastFetchUrl()).toBe("/api/shop/subscriptions/1");
    expect(global.fetch.mock.calls[0][1].method).toBe("PATCH");
  });
});

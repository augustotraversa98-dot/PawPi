import { renderHook, waitFor } from "@testing-library/react-native";

// Control native Apple availability (lazily required inside the hook).
const mockIsAppleAuthAvailable = jest.fn();
jest.mock("./socialAuth", () => ({
  isAppleAuthAvailable: (...args) => mockIsAppleAuthAvailable(...args),
}));

import { useSocialProviders } from "./useSocialProviders";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

function mockSocialEnabled(payload, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    json: async () => payload,
  });
}

describe("useSocialProviders", () => {
  it("shows both when the backend enables both and Apple is device-supported (iOS default)", async () => {
    mockSocialEnabled({ google: true, apple: true });
    mockIsAppleAuthAvailable.mockResolvedValue(true);

    const { result } = renderHook(() => useSocialProviders());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.showGoogle).toBe(true);
    expect(result.current.showApple).toBe(true);
  });

  it("hides Apple when the device does not support native Sign in with Apple", async () => {
    mockSocialEnabled({ google: true, apple: true });
    mockIsAppleAuthAvailable.mockResolvedValue(false);

    const { result } = renderHook(() => useSocialProviders());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.showGoogle).toBe(true);
    expect(result.current.showApple).toBe(false);
  });

  it("shows nothing when the probe fails (offline / error)", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
    mockIsAppleAuthAvailable.mockResolvedValue(true);

    const { result } = renderHook(() => useSocialProviders());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.showGoogle).toBe(false);
    expect(result.current.showApple).toBe(false);
  });
});

let mockHideAsync;
let mockMarkBootStep;

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();

  mockHideAsync = jest.fn().mockResolvedValue(undefined);
  mockMarkBootStep = jest.fn();

  jest.doMock('expo-splash-screen', () => ({
    hideAsync: mockHideAsync,
    preventAutoHideAsync: jest.fn(),
  }));
  jest.doMock('expo-secure-store', () => ({
    getItemAsync: jest.fn().mockResolvedValue(null),
    setItemAsync: jest.fn().mockResolvedValue(undefined),
    deleteItemAsync: jest.fn().mockResolvedValue(undefined),
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
  }));
  jest.doMock('../../../__create/boot-trace', () => ({
    markBootStep: mockMarkBootStep,
  }));
});

afterEach(() => {
  jest.useRealTimers();
});

function loadModules() {
  const { scheduleStartupFallback, STARTUP_FALLBACK_DELAY_MS } = require('./startupFallback');
  const { useAuthStore } = require('./store');
  return { scheduleStartupFallback, STARTUP_FALLBACK_DELAY_MS, useAuthStore };
}

describe('scheduleStartupFallback', () => {
  it('forces the auth store ready (no session) and hides the splash when startup is wedged', () => {
    const { scheduleStartupFallback, STARTUP_FALLBACK_DELAY_MS, useAuthStore } = loadModules();
    expect(useAuthStore.getState().isReady).toBe(false);

    scheduleStartupFallback();
    jest.advanceTimersByTime(STARTUP_FALLBACK_DELAY_MS);

    expect(mockHideAsync).toHaveBeenCalled();
    expect(useAuthStore.getState().isReady).toBe(true);
    expect(useAuthStore.getState().auth).toBeNull();
    expect(mockMarkBootStep).toHaveBeenCalledWith('fallback:forced-ready');
  });

  it('does nothing before the deadline elapses', () => {
    const { scheduleStartupFallback, STARTUP_FALLBACK_DELAY_MS, useAuthStore } = loadModules();

    scheduleStartupFallback();
    jest.advanceTimersByTime(STARTUP_FALLBACK_DELAY_MS - 1);

    expect(mockHideAsync).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isReady).toBe(false);
  });

  it('leaves a normally-initialized session untouched (only the splash-hide re-fires)', () => {
    const { scheduleStartupFallback, STARTUP_FALLBACK_DELAY_MS, useAuthStore } = loadModules();
    const session = { jwt: 'token', user: { id: 1 } };
    useAuthStore.setState({ isReady: true, auth: session });

    scheduleStartupFallback();
    jest.advanceTimersByTime(STARTUP_FALLBACK_DELAY_MS);

    // Startup already succeeded: the session must not be dropped to Welcome.
    expect(useAuthStore.getState().auth).toEqual(session);
    expect(useAuthStore.getState().isReady).toBe(true);
    expect(mockMarkBootStep).not.toHaveBeenCalledWith('fallback:forced-ready');
    // The unconditional hide is harmless when the splash is already gone.
    expect(mockHideAsync).toHaveBeenCalled();
  });

  it('never throws even if hiding the splash rejects', () => {
    mockHideAsync.mockRejectedValue(new Error('native failure'));
    const { scheduleStartupFallback, STARTUP_FALLBACK_DELAY_MS } = loadModules();

    scheduleStartupFallback();
    expect(() => jest.advanceTimersByTime(STARTUP_FALLBACK_DELAY_MS)).not.toThrow();
  });
});

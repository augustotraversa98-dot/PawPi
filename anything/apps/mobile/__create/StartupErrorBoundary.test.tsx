import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

const mockHideAsync = jest.fn().mockResolvedValue(undefined);
const mockLogError = jest.fn();

jest.mock('expo-splash-screen', () => ({
  hideAsync: (...args: unknown[]) => mockHideAsync(...args),
  preventAutoHideAsync: jest.fn(),
}));
jest.mock('./boot-trace', () => ({
  markBootStep: jest.fn(),
  lastBootSummary: jest.fn(() => 'stopped at layout:initiate-effect @ 812ms'),
}));
jest.mock('./testflight-logger', () => ({
  getTestFlightLogger: () => ({ logError: mockLogError }),
}));

import { StartupErrorBoundary, StartupRecoveryScreen } from './StartupErrorBoundary';

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('secret internal detail');
  }
  return <Text>app content</Text>;
}

// React logs caught boundary errors via console.error; keep test output clean.
let consoleErrorSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe('StartupErrorBoundary', () => {
  it('renders children when nothing goes wrong', () => {
    const { getByText, queryByText } = render(
      <StartupErrorBoundary>
        <Bomb shouldThrow={false} />
      </StartupErrorBoundary>
    );
    expect(getByText('app content')).toBeTruthy();
    expect(queryByText(/Something went wrong/)).toBeNull();
  });

  it('catches a render error, hides the splash and shows the warm fallback — never the error text', () => {
    const { getByText, queryByText } = render(
      <StartupErrorBoundary>
        <Bomb shouldThrow={true} />
      </StartupErrorBoundary>
    );

    expect(getByText('Something went wrong. Tap below to try again.')).toBeTruthy();
    expect(getByText('Try Again')).toBeTruthy();
    // The user must never see the error message or a stack trace.
    expect(queryByText(/secret internal detail/)).toBeNull();
    // The fallback must not sit invisible behind the native splash.
    expect(mockHideAsync).toHaveBeenCalled();
    // The error still reaches the TestFlight logger for diagnostics.
    expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('secret internal detail'));
  });

  it('shows the boot-trace diagnostic code on the fallback', () => {
    const { getByText } = render(
      <StartupErrorBoundary>
        <Bomb shouldThrow={true} />
      </StartupErrorBoundary>
    );
    expect(getByText(/Diagnostic: stopped at layout:initiate-effect @ 812ms/)).toBeTruthy();
  });

  it('re-renders children when Try Again is pressed', () => {
    let shouldThrow = true;
    function FlakyChild() {
      if (shouldThrow) {
        throw new Error('secret internal detail');
      }
      return <Text>recovered content</Text>;
    }

    const { getByText } = render(
      <StartupErrorBoundary>
        <FlakyChild />
      </StartupErrorBoundary>
    );
    expect(getByText('Try Again')).toBeTruthy();

    shouldThrow = false;
    fireEvent.press(getByText('Try Again'));
    expect(getByText('recovered content')).toBeTruthy();
  });
});

describe('StartupRecoveryScreen', () => {
  it('renders the warm recovery copy and hides the splash', () => {
    const { getByText } = render(<StartupRecoveryScreen />);
    expect(
      getByText("PawPi couldn't finish starting up. Please close and reopen the app.")
    ).toBeTruthy();
    expect(mockHideAsync).toHaveBeenCalled();
  });
});

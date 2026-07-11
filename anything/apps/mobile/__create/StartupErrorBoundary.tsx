import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { lastBootSummary, markBootStep } from './boot-trace';
import { getTestFlightLogger } from './testflight-logger';

function safeDiagnostic(): string | null {
  try {
    return lastBootSummary();
  } catch (_err) {
    return null;
  }
}

function WarmScreen({ message, buttonLabel, onPress }: {
  message: string;
  buttonLabel?: string;
  onPress?: () => void;
}) {
  const diagnostic = safeDiagnostic();
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#FFF7EF',
        paddingHorizontal: 32,
      }}
    >
      <Text style={{ fontSize: 72, marginBottom: 20 }}>🐾</Text>
      <Text
        style={{
          fontSize: 16,
          fontWeight: '600',
          color: '#7A6254',
          textAlign: 'center',
          marginBottom: 24,
        }}
      >
        {message}
      </Text>
      {buttonLabel && onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityLabel={buttonLabel}
          style={{
            backgroundColor: '#FF6F61',
            paddingHorizontal: 32,
            paddingVertical: 12,
            borderRadius: 24,
          }}
        >
          <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '700' }}>{buttonLabel}</Text>
        </Pressable>
      ) : null}
      {diagnostic ? (
        <Text
          style={{
            marginTop: 24,
            fontSize: 11,
            color: '#B9A79A',
            textAlign: 'center',
          }}
        >
          Diagnostic: {diagnostic}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Last-resort screen registered under 'main' when renderRootComponent itself
 * throws (see index.tsx). Friendly copy only — never an error or stack trace.
 */
export function StartupRecoveryScreen() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  return <WarmScreen message="PawPi couldn't finish starting up. Please close and reopen the app." />;
}

// Production-safe top-level error boundary.
//
// Until now the only error boundary (DeviceErrorBoundary) was installed in
// dev builds only, so a render/lifecycle error in a release build had nothing
// to catch it. This boundary wraps the whole app in EVERY build via
// AppRegistry.setWrapperComponentProvider (see index.tsx). On error it hides
// the native splash (so the fallback is actually visible if the error happened
// during startup) and shows a warm retry screen — matching the EntryPoint
// retry screen's design. It never renders an error message or stack trace to
// the user; the only extra line is a short boot-milestone diagnostic code.

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class StartupErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(_error: unknown): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    try {
      markBootStep('error-boundary:caught');
      // The fallback screen must never sit behind the native splash.
      SplashScreen.hideAsync().catch(() => {});
      const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
      getTestFlightLogger()?.logError(`[ERROR_BOUNDARY] ${message}`);
    } catch (_err) {
      // The boundary must never throw while handling an error.
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return (
      <WarmScreen
        message="Something went wrong. Tap below to try again."
        buttonLabel="Try Again"
        onPress={this.handleRetry}
      />
    );
  }
}

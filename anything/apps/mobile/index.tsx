// Boot-trace first: its import graph is tiny (expo-file-system only), so the
// very first breadcrumb lands before anything heavy evaluates.
import { markBootStep } from './__create/boot-trace';
import ExceptionsManager from 'react-native/Libraries/Core/ExceptionsManager';
import 'react-native-url-polyfill/auto';
import './src/__create/polyfills';
import '@expo/metro-runtime';
import { AppRegistry, LogBox } from 'react-native';
import { StartupErrorBoundary, StartupRecoveryScreen } from './__create/StartupErrorBoundary';
import { initTestFlightLogger } from './__create/testflight-logger';
import { scheduleStartupFallback } from './src/utils/auth/startupFallback';

if (__DEV__) {
  ExceptionsManager.handleException = (error, isFatal) => {
    // no-op
  };
}

global.Buffer = require('buffer').Buffer;

markBootStep('entry:core-imports-evaluated');

// Arm the hard startup deadline BEFORE loading the heavy app graph: it runs
// outside React, so even if everything below stalls, the splash still comes
// down and the app falls through to Welcome (see startupFallback.js).
scheduleStartupFallback();

try {
  initTestFlightLogger();
} catch (_err) {
  // Startup helpers must never prevent the app from rendering.
}

markBootStep('entry:logger-initialized');

// The heavy tail is loaded via require() (imports would be hoisted above the
// breadcrumbs) so each stage gets its own milestone — if a release build ever
// stalls during module evaluation again, the boot trace names the stage.
const { renderRootComponent } = require('expo-router/build/renderRootComponent');
markBootStep('entry:router-runtime-loaded');
const App = require('./entrypoint').default;
markBootStep('entry:app-graph-loaded');
const { DeviceErrorBoundaryWrapper } = require('./__create/DeviceErrorBoundary');
const AnythingMenu = require('./src/__create/anything-menu').default;
markBootStep('entry:aux-graph-loaded');

const isDevelopmentLike = __DEV__ || process.env.EXPO_PUBLIC_CREATE_ENV === 'DEVELOPMENT';

if (isDevelopmentLike) {
  LogBox.ignoreAllLogs();
  LogBox.uninstall();
}

// The error boundary wraps the app in EVERY build (it used to exist only in
// dev), so a render error shows the warm retry screen instead of a dead app.
AppRegistry.setWrapperComponentProvider(() => ({ children }) => {
  if (isDevelopmentLike) {
    return (
      <StartupErrorBoundary>
        <DeviceErrorBoundaryWrapper>{children}</DeviceErrorBoundaryWrapper>
        <AnythingMenu />
      </StartupErrorBoundary>
    );
  }
  return <StartupErrorBoundary>{children}</StartupErrorBoundary>;
});

markBootStep('entry:render-root');
try {
  renderRootComponent(App);
} catch (_err) {
  // renderRootComponent must always leave SOMETHING registered under 'main' —
  // if it threw, register the warm recovery screen so the launch still lands
  // on a visible screen instead of a frozen splash.
  markBootStep('entry:render-root-threw');
  try {
    AppRegistry.registerComponent('main', () => StartupRecoveryScreen);
  } catch (_registerErr) {
    // Nothing left to try — the startup fallback timer will still hide the splash.
  }
}
markBootStep('entry:module-eval-done');

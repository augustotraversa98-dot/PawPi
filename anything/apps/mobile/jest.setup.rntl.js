// React Native Testing Library global config.
//
// RNTL 12+ flipped the default of `defaultIncludeHiddenElements` to false, so queries stop
// matching elements that are hidden from accessibility — including anything under a
// `display: "none"` wrapper. The storefront shell (app/service/provider.jsx) intentionally
// renders its section panels MOUNTED-BUT-HIDDEN (inactive tab → display:"none") so every
// section stays in the tree and its testIDs keep resolving without navigating tabs. Restoring
// the include-hidden default (the RNTL ≤11 / RTL-web behavior) is what makes that contract
// hold for the existing provider/place tests.
import { configure } from "@testing-library/react-native";

configure({ defaultIncludeHiddenElements: true });

// Long timers must not keep the Jest process alive.
//
// React Query schedules a garbage-collection timer (`gcTime`: 5 min by default, 30 min for the
// app's shared client in utils/queryClient.js) for every query a test creates, and most test
// files never clear their QueryClient. When Jest runs the tests in its own process (`--runInBand`,
// or automatically when the machine only offers one worker) those timers keep the process alive
// after the last test passes: "Jest did not exit one second after the test run has completed",
// then an idle wait of the full gcTime — CI sat for ~30 minutes with all 324 suites already green.
// With several workers Jest force-kills them, which is why the same suite takes ~2 minutes there.
//
// Un-ref'ing any timer of 10 s or more makes the hang impossible regardless of worker count. It
// changes nothing a test can observe: the timer still fires if the process is alive for other
// reasons (a running test always is — Jest's own per-test timeout is a ref'd handle), and no test
// waits on a real timer anywhere near 10 s. Fake timers replace `setTimeout` themselves, so they
// are unaffected.
const LONG_TIMER_MS = 10000;
const realSetTimeout = global.setTimeout;
const setTimeoutUnrefLong = Object.assign(function setTimeout(...args) {
  const handle = realSetTimeout.apply(this, args);
  if (args[1] >= LONG_TIMER_MS && handle && typeof handle.unref === "function") handle.unref();
  return handle;
}, realSetTimeout);
global.setTimeout = setTimeoutUnrefLong;

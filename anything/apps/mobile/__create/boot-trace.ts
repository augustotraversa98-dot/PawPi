import { File, Paths } from 'expo-file-system';

// Boot breadcrumbs: a synchronous on-disk trail of startup milestones.
//
// TestFlight release builds surface no JS logs and a startup HANG produces no
// crash report, so when the app freezes on the splash screen there is nothing
// to inspect. This module writes a tiny JSON file to disk SYNCHRONOUSLY after
// each milestone, so however hard the current launch stalls, the NEXT launch
// (or the startup-fallback screen) can read exactly how far the previous one
// got. Written synchronously for the same reason as the crash snapshot in
// testflight-logger: an async write scheduled just before a stall never runs.
//
// Every function swallows every error — diagnostics must never break the boot
// they are diagnosing.

const CURRENT_FILE = 'boot_trace_current.json';
const LAST_FILE = 'boot_trace_last.json';

export interface BootTrace {
  startedAt: string;
  completed: boolean;
  steps: { step: string; ms: number }[];
}

let initialized = false;
let bootStart = 0;
let trace: BootTrace | null = null;
let lastTrace: BootTrace | null = null;

function readTraceFile(name: string): BootTrace | null {
  try {
    const file = new File(Paths.document, name);
    if (!file.exists) return null;
    const parsed: unknown = JSON.parse(file.textSync());
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as BootTrace).steps)) {
      return parsed as BootTrace;
    }
    return null;
  } catch (_err) {
    return null;
  }
}

function writeTraceFile(name: string, content: BootTrace): void {
  try {
    const file = new File(Paths.document, name);
    if (file.exists) {
      file.delete();
    }
    file.create();
    file.write(JSON.stringify(content));
  } catch (_err) {
    // Silent — never break the boot
  }
}

// Rotate the previous launch's trail into LAST_FILE and start a fresh one.
// Runs lazily on the first mark so module evaluation stays side-effect free
// (jest imports this file too).
function init(): void {
  if (initialized) return;
  initialized = true;
  try {
    bootStart = Date.now();
    lastTrace = readTraceFile(CURRENT_FILE);
    if (lastTrace) {
      writeTraceFile(LAST_FILE, lastTrace);
    }
    trace = { startedAt: new Date().toISOString(), completed: false, steps: [] };
    writeTraceFile(CURRENT_FILE, trace);
  } catch (_err) {
    // Silent
  }
}

/**
 * Record a startup milestone. Idempotent per step name (render functions may
 * call it on every render — only the first occurrence is kept), and persisted
 * to disk synchronously so it survives a hang later in the same launch.
 */
export function markBootStep(step: string): void {
  try {
    init();
    if (!trace) return;
    if (trace.steps.some((s) => s.step === step)) return;
    trace.steps.push({ step, ms: Date.now() - bootStart });
    writeTraceFile(CURRENT_FILE, trace);
  } catch (_err) {
    // Silent
  }
}

/**
 * Mark the boot as fully successful (the router delivered the user to a real
 * screen). A trace without this flag means that launch stalled or was killed.
 */
export function markBootComplete(): void {
  try {
    init();
    if (!trace || trace.completed) return;
    trace.completed = true;
    trace.steps.push({ step: 'boot:complete', ms: Date.now() - bootStart });
    writeTraceFile(CURRENT_FILE, trace);
  } catch (_err) {
    // Silent
  }
}

/** The previous launch's trail (null on first launch or if unreadable). */
export function getLastBootTrace(): BootTrace | null {
  try {
    init();
    return lastTrace;
  } catch (_err) {
    return null;
  }
}

/**
 * True when the previous launch either never reached `boot:complete` or only
 * got there because the hard startup fallback forced it through.
 */
export function didLastBootStall(): boolean {
  try {
    init();
    if (!lastTrace) return false;
    return (
      !lastTrace.completed || lastTrace.steps.some((s) => s.step === 'fallback:forced-ready')
    );
  } catch (_err) {
    return false;
  }
}

/**
 * Short human-readable summary of where the previous launch stopped, e.g.
 * "stalled after layout:initiate-effect @ 812ms". Used as the diagnostic line
 * on the fallback/Welcome screens — a milestone code, never an error or stack
 * trace. When the fallback forced that launch through, the step right BEFORE
 * the forcing is the stall point, even if the launch then completed.
 */
export function lastBootSummary(): string | null {
  try {
    init();
    if (!lastTrace) return null;
    const steps = lastTrace.steps;
    const forcedIdx = steps.findIndex((s) => s.step === 'fallback:forced-ready');
    if (forcedIdx === 0) return 'stalled before the first milestone';
    if (forcedIdx > 0) {
      const before = steps[forcedIdx - 1];
      return `stalled after ${before.step} @ ${before.ms}ms`;
    }
    if (!lastTrace.completed) {
      const last = steps[steps.length - 1];
      if (!last) return 'no milestones recorded';
      return `stopped at ${last.step} @ ${last.ms}ms`;
    }
    return null;
  } catch (_err) {
    return null;
  }
}

/** True when THIS launch needed the hard startup fallback to render. */
export function didForceStartupFallback(): boolean {
  try {
    return trace != null && trace.steps.some((s) => s.step === 'fallback:forced-ready');
  } catch (_err) {
    return false;
  }
}

let mockFileStore: Record<string, string>;

const CURRENT = '/doc/boot_trace_current.json';
const LAST = '/doc/boot_trace_last.json';

beforeEach(() => {
  jest.resetModules();
  mockFileStore = {};

  jest.doMock('expo-file-system', () => {
    class MockFile {
      uri: string;
      constructor(directory: string, name: string) {
        this.uri = `${directory}/${name}`;
      }
      get exists() {
        return Object.prototype.hasOwnProperty.call(mockFileStore, this.uri);
      }
      create() {
        if (!(this.uri in mockFileStore)) mockFileStore[this.uri] = '';
      }
      delete() {
        delete mockFileStore[this.uri];
      }
      write(content: string) {
        mockFileStore[this.uri] = content;
      }
      textSync() {
        return mockFileStore[this.uri] ?? '';
      }
    }
    return { File: MockFile, Paths: { document: '/doc' } };
  });
});

function loadModule() {
  return require('./boot-trace') as typeof import('./boot-trace');
}

function currentTrace() {
  return JSON.parse(mockFileStore[CURRENT]);
}

describe('markBootStep', () => {
  it('persists each milestone to disk synchronously', () => {
    const { markBootStep } = loadModule();

    markBootStep('entry:core-imports-evaluated');
    markBootStep('layout:render');

    const trace = currentTrace();
    expect(trace.completed).toBe(false);
    expect(trace.steps.map((s: { step: string }) => s.step)).toEqual([
      'entry:core-imports-evaluated',
      'layout:render',
    ]);
  });

  it('is idempotent per step name (render functions may re-call it)', () => {
    const { markBootStep } = loadModule();

    markBootStep('layout:render');
    markBootStep('layout:render');
    markBootStep('layout:render');

    expect(currentTrace().steps).toHaveLength(1);
  });

  it('never throws when the filesystem is broken', () => {
    jest.resetModules();
    jest.doMock('expo-file-system', () => {
      class BrokenFile {
        constructor() {
          throw new Error('native module unavailable');
        }
      }
      return { File: BrokenFile, Paths: { document: '/doc' } };
    });
    const { markBootStep, markBootComplete, getLastBootTrace, didLastBootStall } = loadModule();

    expect(() => {
      markBootStep('entry:core-imports-evaluated');
      markBootComplete();
    }).not.toThrow();
    expect(getLastBootTrace()).toBeNull();
    expect(didLastBootStall()).toBe(false);
  });
});

describe('markBootComplete', () => {
  it('flags the trace as completed', () => {
    const { markBootStep, markBootComplete } = loadModule();

    markBootStep('entrypoint:redirect');
    markBootComplete();

    const trace = currentTrace();
    expect(trace.completed).toBe(true);
    expect(trace.steps[trace.steps.length - 1].step).toBe('boot:complete');
  });
});

describe('previous-launch rotation', () => {
  it("exposes the previous launch's trail as the last boot trace", () => {
    // Simulate a previous launch that stalled after the initiate effect.
    mockFileStore[CURRENT] = JSON.stringify({
      startedAt: '2026-07-10T00:00:00.000Z',
      completed: false,
      steps: [
        { step: 'entry:core-imports-evaluated', ms: 10 },
        { step: 'layout:initiate-effect', ms: 812 },
      ],
    });

    const { markBootStep, getLastBootTrace, didLastBootStall, lastBootSummary } = loadModule();
    markBootStep('entry:core-imports-evaluated');

    expect(getLastBootTrace()?.steps).toHaveLength(2);
    expect(didLastBootStall()).toBe(true);
    expect(lastBootSummary()).toBe('stopped at layout:initiate-effect @ 812ms');
    // The rotated copy also lands on disk for post-mortem reads.
    expect(JSON.parse(mockFileStore[LAST]).completed).toBe(false);
  });

  it('reports no stall after a clean previous launch', () => {
    mockFileStore[CURRENT] = JSON.stringify({
      startedAt: '2026-07-10T00:00:00.000Z',
      completed: true,
      steps: [{ step: 'boot:complete', ms: 900 }],
    });

    const { markBootStep, didLastBootStall, lastBootSummary } = loadModule();
    markBootStep('entry:core-imports-evaluated');

    expect(didLastBootStall()).toBe(false);
    expect(lastBootSummary()).toBeNull();
  });

  it('pinpoints the stall step when the previous launch was rescued by the fallback', () => {
    // The fallback forced the launch through, and it then completed normally —
    // the stall point is the step right before the forcing, not the last step.
    mockFileStore[CURRENT] = JSON.stringify({
      startedAt: '2026-07-10T00:00:00.000Z',
      completed: true,
      steps: [
        { step: 'entry:core-imports-evaluated', ms: 12 },
        { step: 'auth:initiate-start', ms: 300 },
        { step: 'fallback:forced-ready', ms: 4005 },
        { step: 'entrypoint:no-auth-welcome', ms: 4020 },
        { step: 'boot:complete', ms: 4100 },
      ],
    });

    const { markBootStep, didLastBootStall, lastBootSummary } = loadModule();
    markBootStep('entry:core-imports-evaluated');

    expect(didLastBootStall()).toBe(true);
    expect(lastBootSummary()).toBe('stalled after auth:initiate-start @ 300ms');
  });

  it('reports a stall before the first milestone (bundle never ran)', () => {
    mockFileStore[CURRENT] = JSON.stringify({
      startedAt: '2026-07-10T00:00:00.000Z',
      completed: false,
      steps: [],
    });

    const { markBootStep, lastBootSummary, didLastBootStall } = loadModule();
    markBootStep('entry:core-imports-evaluated');

    expect(didLastBootStall()).toBe(true);
    expect(lastBootSummary()).toBe('no milestones recorded');
  });
});

describe('didForceStartupFallback', () => {
  it('is true only when this launch recorded fallback:forced-ready', () => {
    const { markBootStep, didForceStartupFallback } = loadModule();

    markBootStep('entry:core-imports-evaluated');
    expect(didForceStartupFallback()).toBe(false);

    markBootStep('fallback:forced-ready');
    expect(didForceStartupFallback()).toBe(true);
  });
});

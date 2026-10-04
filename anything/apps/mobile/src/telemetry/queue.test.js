import { createQueue, QUEUE_DEFAULTS } from './queue';
import { makeClock, flushPromises } from './testKit';

const ev = (n, session_id = 's1') => ({ session_id, name: 'screen_view', t: n, props: { screen: '/health' } });

function harness(overrides = {}) {
  const clock = makeClock();
  const sent = [];
  let result = 'ok';
  const q = createQueue({
    send: async (batch) => {
      sent.push(batch);
      return typeof result === 'function' ? result(batch) : result;
    },
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    ...overrides,
  });
  return { q, clock, sent, setResult: (r) => (result = r) };
}

describe('queue', () => {
  it('uses the contract defaults (200 cap, flush at 20 events or every 15 s)', () => {
    expect(QUEUE_DEFAULTS.maxSize).toBe(200);
    expect(QUEUE_DEFAULTS.flushSize).toBe(20);
    expect(QUEUE_DEFAULTS.flushIntervalMs).toBe(15000);
    expect(QUEUE_DEFAULTS.maxBatch).toBe(50);
  });

  it('overflow: keeps the newest 200 and drops the OLDEST', () => {
    const { q } = harness(); // never started: nothing flushes, everything buffers
    for (let i = 0; i < 250; i += 1) q.push(ev(i));
    expect(q.size()).toBe(200);
    expect(q.droppedCount()).toBe(50);
    const kept = q.peek();
    expect(kept[0].t).toBe(50);
    expect(kept[199].t).toBe(249);
  });

  it('flushes when 20 events are waiting', async () => {
    const { q, sent } = harness();
    q.start();
    for (let i = 0; i < 19; i += 1) q.push(ev(i));
    await flushPromises();
    expect(sent).toHaveLength(0);
    q.push(ev(19));
    await flushPromises();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toHaveLength(20);
    expect(q.size()).toBe(0);
  });

  it('flushes 15 s after the first waiting event (timer, no real time)', async () => {
    const { q, clock, sent } = harness();
    q.start();
    q.push(ev(1));
    await clock.advance(14_999);
    expect(sent).toHaveLength(0);
    await clock.advance(2);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toHaveLength(1);
  });

  it('does not arm a timer before start() and flush() (app background) sends immediately', async () => {
    const { q, clock, sent } = harness();
    q.push(ev(1));
    expect(clock.pending()).toBe(0);
    await q.flush();
    expect(sent).toHaveLength(1);
  });

  it('never puts more than 50 events (or two sessions) in one request', async () => {
    const { q, sent } = harness();
    for (let i = 0; i < 60; i += 1) q.push(ev(i, 'a'));
    q.push(ev(100, 'b'));
    await q.flush();
    expect(sent.map((b) => b.length)).toEqual([50, 10, 1]);
    expect(sent[2][0].session_id).toBe('b');
  });

  it('a failed send keeps the events (bounded), backs off, and retries later', async () => {
    const { q, clock, sent, setResult } = harness();
    q.start();
    setResult('retry');
    for (let i = 0; i < 20; i += 1) q.push(ev(i));
    await flushPromises();
    expect(sent).toHaveLength(1);
    expect(q.size()).toBe(20);
    // backed off: the next attempt is later than the plain 15 s
    await clock.advance(15_000);
    expect(sent).toHaveLength(1);
    setResult('ok');
    await clock.advance(60_000);
    expect(sent.length).toBeGreaterThan(1);
    expect(q.size()).toBe(0);
  });

  it('a failing network can never grow the queue past the cap', async () => {
    const { q, setResult } = harness();
    q.start();
    setResult('retry');
    for (let i = 0; i < 500; i += 1) q.push(ev(i));
    await flushPromises();
    expect(q.size()).toBeLessThanOrEqual(200);
  });

  it("'drop' (server refused the batch for good) discards it instead of retrying forever", async () => {
    const { q, setResult } = harness();
    setResult('drop');
    q.push(ev(1));
    await q.flush();
    expect(q.size()).toBe(0);
  });

  it('a throwing sender is treated as a failed send and flush() never rejects', async () => {
    const q = createQueue({
      send: async () => {
        throw new Error('boom');
      },
    });
    q.push(ev(1));
    await expect(q.flush()).resolves.toBeUndefined();
    expect(q.size()).toBe(1);
  });

  it('waits while canSend() is false (and says so), then sends', async () => {
    let allowed = false;
    let blocked = 0;
    const sent = [];
    const q = createQueue({
      send: async (b) => {
        sent.push(b);
        return 'ok';
      },
      canSend: () => allowed,
      onBlocked: () => {
        blocked += 1;
      },
    });
    q.push(ev(1));
    await q.flush();
    expect(sent).toHaveLength(0);
    expect(blocked).toBe(1);
    allowed = true;
    await q.flush();
    expect(sent).toHaveLength(1);
  });

  it('clear() empties the queue and a batch that was in flight does not come back', async () => {
    let release;
    const gate = new Promise((r) => {
      release = r;
    });
    const q = createQueue({
      send: async () => {
        await gate;
        return 'retry';
      },
    });
    q.push(ev(1));
    const flushing = q.flush();
    await flushPromises();
    q.clear();
    release();
    await flushing;
    expect(q.size()).toBe(0);
  });

  it('push() never throws and ignores non-objects', () => {
    const { q } = harness();
    expect(() => q.push(undefined)).not.toThrow();
    expect(() => q.push(null)).not.toThrow();
    expect(q.size()).toBe(0);
  });
});

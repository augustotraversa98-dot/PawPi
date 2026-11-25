// A TCP proxy between the app's pool and the throwaway Postgres that (a) delays every chunk by `delayMs` in EACH
// direction and (b) counts real WIRE flights. This is the "pooler-like path" the JS-side counter in roundTrips.ts
// cannot be: that one counts how many times JavaScript awaits, and it is blind to what porsager does on the socket
// (with prepare:false a parameterised statement waits for Postgres to describe its parameters before it sends the
// query - two flights that never show up as two awaits). Production latency is flights x ~133 ms; this counts them.
//
// A flight = a burst of client->server bytes that starts after the server has answered the previous burst. Bytes the
// client writes while its last burst is still unanswered join that burst (that is what pipelining is). The proxy is
// unaware of the Postgres protocol, so it measures exactly what a network sees.
//
// What it does NOT model: a pooler that refuses to relay pipelined messages. Supavisor in session mode relays them
// (measured on production 2026-10-26: BEGIN + stamp + 4 reads + COMMIT = 1.1 flights), so a pass here is meaningful;
// re-run scripts/ spike-style measurements against production after any porsager upgrade.

import net from 'node:net';

export interface DelayProxy {
  port: number;
  /** Flights since the last reset(). */
  flights(): number;
  /** Client->server chunks since the last reset() (0 means the database was never touched). */
  clientChunks(): number;
  reset(): void;
  /** Client connections open right now = the size of the app's pool as the network sees it. */
  connections(): number;
  /**
   * Resolves once NOTHING is in flight: no delayed chunk is waiting to be delivered and every connection's last burst has been
   * answered, and it stays that way for a few polls in a row. Use it instead of a fixed sleep to "let a deferred COMMIT finish":
   * a sleep is a guess about how long a flight takes, and a loaded CI runner outruns it (a next request then finds its connection
   * busy and lands on another one). This waits for the actual event. Rejects after `timeoutMs` so a stuck connection fails loudly.
   */
  idle(timeoutMs?: number): Promise<void>;
  close(): Promise<void>;
}

export async function startDelayProxy(targetPort: number, delayMs = 12, targetHost = '127.0.0.1'): Promise<DelayProxy> {
  let flights = 0;
  let clientChunks = 0;
  // Delayed chunks scheduled but not yet written to their destination (both directions).
  let pending = 0;
  // Per connection: has the server answered since the client's last burst?
  const sockets = new Set<net.Socket>();
  const conns = new Set<{ answered: boolean }>();

  const server = net.createServer((client) => {
    const upstream = net.connect(targetPort, targetHost);
    sockets.add(client);
    sockets.add(upstream);
    const state = { answered: true };
    conns.add(state);
    // One place that schedules a delayed write, so `pending` is exact (it is what idle() waits on).
    const later = (fn: () => void) => {
      pending += 1;
      setTimeout(() => {
        pending -= 1;
        fn();
      }, delayMs);
    };

    client.on('data', (chunk) => {
      clientChunks += 1;
      if (state.answered) {
        flights += 1;
        state.answered = false;
      }
      later(() => !upstream.destroyed && upstream.write(chunk));
    });
    upstream.on('data', (chunk) => {
      state.answered = true;
      later(() => !client.destroyed && client.write(chunk));
    });

    const kill = () => {
      conns.delete(state);
      client.destroy();
      upstream.destroy();
      sockets.delete(client);
      sockets.delete(upstream);
    };
    client.on('error', kill);
    upstream.on('error', kill);
    client.on('close', kill);
    upstream.on('close', kill);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;

  return {
    port,
    flights: () => flights,
    clientChunks: () => clientChunks,
    reset: () => {
      flights = 0;
      clientChunks = 0;
    },
    connections: () => conns.size,
    idle: async (timeoutMs = 15_000) => {
      const deadline = Date.now() + timeoutMs;
      let quiet = 0;
      // A few quiet polls in a row, not one: the client may be about to write its next burst on the very next tick.
      while (quiet < 3) {
        if (Date.now() > deadline) throw new Error(`delay proxy still busy after ${timeoutMs} ms (pending chunks: ${pending})`);
        await new Promise((r) => setTimeout(r, 10));
        quiet = pending === 0 && [...conns].every((c) => c.answered) ? quiet + 1 : 0;
      }
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
}

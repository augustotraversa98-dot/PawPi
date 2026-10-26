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
  close(): Promise<void>;
}

export async function startDelayProxy(targetPort: number, delayMs = 12, targetHost = '127.0.0.1'): Promise<DelayProxy> {
  let flights = 0;
  let clientChunks = 0;
  // Per connection: has the server answered since the client's last burst?
  const sockets = new Set<net.Socket>();

  const server = net.createServer((client) => {
    const upstream = net.connect(targetPort, targetHost);
    sockets.add(client);
    sockets.add(upstream);
    let answered = true;

    client.on('data', (chunk) => {
      clientChunks += 1;
      if (answered) {
        flights += 1;
        answered = false;
      }
      setTimeout(() => !upstream.destroyed && upstream.write(chunk), delayMs);
    });
    upstream.on('data', (chunk) => {
      answered = true;
      setTimeout(() => !client.destroyed && client.write(chunk), delayMs);
    });

    const kill = () => {
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
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
}

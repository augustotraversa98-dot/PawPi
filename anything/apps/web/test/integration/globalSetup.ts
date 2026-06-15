// Vitest globalSetup for the real-Postgres integration suite (RLS R0 / Phase C).
//
// Boots ONE throwaway embedded Postgres for the whole run (no Docker — a real
// Postgres binary run as a child process), applies the real migrations, and
// publishes the connection string to test files via provide()/inject(). On
// teardown it stops the cluster (persistent:false wipes the data dir) and
// removes the temp directory.
//
// This never touches Supabase or the app singleton (src/app/api/utils/sql.js).

import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import EmbeddedPostgres from 'embedded-postgres';
import postgres from 'postgres';
import type { GlobalSetupContext } from 'vitest/node';
import { runMigrations } from './migrate';

const DB_NAME = 'pawpi_test';
const DB_USER = 'pawpi';
const DB_PASSWORD = 'pawpi';

/** Ask the OS for a free TCP port so parallel CI jobs never collide on 5432. */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const { port } = address;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Could not acquire a free port')));
      }
    });
  });
}

export default async function setup({ provide }: GlobalSetupContext) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pawpi-pg-'));
  const port = await getFreePort();

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: DB_USER,
    password: DB_PASSWORD,
    port,
    persistent: false,
    // Keep test output readable — swallow the cluster's chatty stdout/stderr.
    onLog: () => {},
    onError: () => {},
  });

  await pg.initialise();
  await pg.start();
  await pg.createDatabase(DB_NAME);

  const url = `postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${port}/${DB_NAME}`;

  // Apply migrations once, up front, on a throwaway connection.
  const migrationSql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const applied = await runMigrations(migrationSql);
    // eslint-disable-next-line no-console
    console.log(
      `[integration] embedded Postgres ready on :${port} — applied ${applied.length} migrations`,
    );
  } finally {
    await migrationSql.end();
  }

  provide('TEST_DATABASE_URL', url);

  return async () => {
    await pg.stop();
    await rm(dataDir, { recursive: true, force: true });
  };
}

// Type the provide()/inject() channel so test files get `string` from inject.
declare module 'vitest' {
  export interface ProvidedContext {
    TEST_DATABASE_URL: string;
  }
}

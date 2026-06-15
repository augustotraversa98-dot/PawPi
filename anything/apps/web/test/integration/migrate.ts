// Migration runner for the integration harness (RLS R0 / Phase C).
//
// Deliberately vitest-free: globalSetup.ts runs in a different context where
// importing `vitest` (for inject) throws, so the migration logic lives here,
// apart from db.ts (which is the test-side helper that uses inject()).

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Sql } from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// test/integration -> web -> apps -> anything -> repo root -> supabase/migrations
export const MIGRATIONS_DIR = path.resolve(
  __dirname,
  '../../../../../supabase/migrations',
);

/**
 * Apply every supabase/migrations/*.sql in ascending filename order. The files
 * are plain idempotent DDL (no functions / dollar-quoting / psql meta-commands),
 * so each whole file executes in one porsager simple-query call (multi-statement
 * is supported when no parameters are bound). Fails loudly, naming the file.
 */
export async function runMigrations(sql: Sql): Promise<string[]> {
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (files.length === 0) {
    throw new Error(`No .sql migrations found in ${MIGRATIONS_DIR}`);
  }
  for (const file of files) {
    const text = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await sql.unsafe(text);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Migration ${file} failed: ${message}`);
    }
  }
  return files;
}

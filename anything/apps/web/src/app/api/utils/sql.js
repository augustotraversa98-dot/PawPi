import postgres from 'postgres';

const NullishQueryFunction = () => {
  throw new Error(
    'No database connection string was provided to `postgres()`. Perhaps process.env.DATABASE_URL has not been set'
  );
};
NullishQueryFunction.transaction = () => {
  throw new Error(
    'No database connection string was provided to `postgres()`. Perhaps process.env.DATABASE_URL has not been set'
  );
};

// Standard Postgres (Supabase) via porsager's `postgres` — the tagged-template
// `sql` API is a drop-in for the previous neon() usage at all call sites.
//
// NOTE: we parse DATABASE_URL ourselves and pass the parts explicitly instead of
// letting `postgres(url)` parse it. porsager mishandles Supabase pooler usernames
// that contain a dot (`postgres.<project-ref>`) — it sends just "postgres", which
// fails auth. Passing username/password explicitly avoids that.
// prepare:false keeps us compatible with Supabase's pooler (pgbouncer).
function createSql(connectionString) {
  const u = new URL(connectionString);
  return postgres({
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    database: u.pathname.replace(/^\//, '') || 'postgres',
    username: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    prepare: false,
    ssl: 'require',
  });
}

const sql = process.env.DATABASE_URL
  ? createSql(process.env.DATABASE_URL)
  : NullishQueryFunction;

export default sql;

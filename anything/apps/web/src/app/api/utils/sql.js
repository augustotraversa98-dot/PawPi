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

// Standard Postgres (Supabase) via porsager's `postgres` — tagged-template `sql`
// API is a drop-in for the previous neon() usage at all call sites.
// prepare:false keeps us compatible with Supabase's transaction pooler (pgbouncer).
const sql = process.env.DATABASE_URL
  ? postgres(process.env.DATABASE_URL, { prepare: false, ssl: 'require' })
  : NullishQueryFunction;

export default sql;

// Jest globalSetup for the UTC-negative timezone regression suite (jest.config.tz-negative.js).
// The main suite is pinned to Europe/Rome (UTC-positive — see jest.tz.setup.js), which never
// exercises a negative-offset date-only bug: a Postgres `date` column parsed via `new
// Date(dateOnlyString)` shifts a DAY BACK only when the device is behind UTC, e.g. Buenos Aires
// (UTC-3). That needs its own process (not just a per-test override) for the same reason
// jest.tz.setup.js pins Europe/Rome in globalSetup rather than per-test: workers inherit env at
// spawn, and V8 caches the zone on first Date use — a mid-suite process.env.TZ reassignment is a
// silent no-op once a worker has already touched Date. Run via `npm run test:tz-negative`.
module.exports = async () => {
  process.env.TZ = "America/Argentina/Buenos_Aires";
};

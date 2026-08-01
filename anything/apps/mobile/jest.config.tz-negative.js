// Separate Jest invocation for the UTC-negative timezone regression test (see
// jest.tz.negative.setup.js for why this can't just be a per-test process.env.TZ override in
// the main suite). Run via `npm run test:tz-negative`. Same preset as the main config
// (package.json's "jest" block); only globalSetup and testMatch differ.
module.exports = {
  preset: "jest-expo",
  globalSetup: "<rootDir>/jest.tz.negative.setup.js",
  testMatch: ["**/*.test.tz-negative.{js,jsx,ts,tsx}"],
};

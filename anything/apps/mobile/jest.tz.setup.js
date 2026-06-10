// Jest globalSetup: pin the suite's timezone before workers spawn (they inherit
// the env, and V8 caches the zone on first Date use). The Today/Overdue pipeline
// does local-calendar math, and the real-shape regression fixture
// (src/utils/__fixtures__/) was captured on a UTC+2 device — so tests must run
// in that zone everywhere, including UTC CI runners. All other tests build dates
// with local-time constructors and are timezone-agnostic, so this pin doesn't
// change what they assert. (globalSetup, not setupFiles: the jest-expo preset
// defines setupFiles, and a package.json setupFiles entry would REPLACE it.)
module.exports = async () => {
  process.env.TZ = "Europe/Rome";
};

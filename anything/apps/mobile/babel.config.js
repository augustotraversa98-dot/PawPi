module.exports = function (api) {
  // Re-evaluate (and cache per value of) NODE_ENV so the production-only
  // console-stripping below is applied to release builds but not to dev/test.
  api.cache.using(() => process.env.NODE_ENV);

  const plugins = [];

  // (AUDIT A-27) Strip console.* from the RELEASE bundle. The app's debug logs
  // otherwise ship to client logs with PII — auth email, full user/pet objects,
  // health-log payloads and medical file URLs. Keep error/warn so genuine
  // failures are still observable in production diagnostics.
  if (process.env.NODE_ENV === "production") {
    plugins.push(["transform-remove-console", { exclude: ["error", "warn"] }]);
  }

  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    plugins,
  };
};

import Constants from "expo-constants";

// The version shown in Settings must come from the real app config, never a literal
// (QA 2026-10-16 bug 02: the footer said "v1.0.0" on a 1.0.2 build).
//
// Preference order: the native binary's own values (what is actually installed) when the
// runtime exposes them, then the config baked in at build time (app.json `version`,
// `ios.buildNumber`). The build number is optional — with remote EAS versioning it may not
// be in the config — so the label simply omits it when unknown.
export function getAppVersionInfo() {
  const version =
    Constants?.nativeAppVersion || Constants?.expoConfig?.version || null;
  const build =
    Constants?.nativeBuildVersion ||
    Constants?.expoConfig?.ios?.buildNumber ||
    Constants?.expoConfig?.android?.versionCode ||
    null;
  return {
    version: version ? String(version) : null,
    build: build ? String(build) : null,
  };
}

// "v1.0.2 (26)" / "v1.0.2" / "" when nothing is known (caller then shows just the name).
export function formatAppVersion({ version, build } = getAppVersionInfo()) {
  if (!version) return "";
  return build ? `v${version} (${build})` : `v${version}`;
}

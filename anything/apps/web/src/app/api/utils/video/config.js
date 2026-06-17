// video/config — env-key reading for the telehealth VIDEO vendor (Phase 2 ticket 2.18).
//
// Mirrors payments/config exactly: the video vendor is SCAFFOLDED-BUT-DORMANT behind env
// keys. If the keys are unset, the join route returns a clean 503 ("Video consults aren't set
// up yet") and NEVER crashes. NO real keys are ever committed — see anything/apps/web/.env.example.

// A 503-shaped error the routes convert to a clean 503 — the vendor isn't configured yet,
// which is a server-config state, not a client error.
export class VideoNotConfiguredError extends Error {
  constructor() {
    super("Video consults aren't set up yet");
    this.name = "VideoNotConfiguredError";
    this.status = 503;
  }
}

// Resolve the video vendor config or null when any required key is missing (the "not
// configured" signal). Vendor-agnostic: VIDEO_PROVIDER selects the adapter (default
// 'generic'); VIDEO_API_KEY/SECRET are the credentials; VIDEO_BASE_URL is the room host.
export function videoConfig() {
  const {
    VIDEO_PROVIDER,
    VIDEO_API_KEY,
    VIDEO_API_SECRET,
    VIDEO_BASE_URL,
  } = process.env;
  if (!VIDEO_API_KEY || !VIDEO_API_SECRET) {
    return null;
  }
  return {
    provider: VIDEO_PROVIDER || "generic",
    apiKey: VIDEO_API_KEY,
    apiSecret: VIDEO_API_SECRET,
    baseUrl: (VIDEO_BASE_URL || "https://video.pawpi.example").replace(/\/+$/, ""),
  };
}

export function isVideoConfigured() {
  return videoConfig() != null;
}

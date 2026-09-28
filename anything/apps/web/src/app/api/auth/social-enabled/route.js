import { socialEnabled } from "@/app/api/utils/oauthProviders.js";

// GET /api/auth/social-enabled — tells the mobile app which social sign-in buttons to render.
// Returns { google: boolean, apple: boolean } based purely on which env keys are configured on
// the server, so a button is never shown when the backend can't actually complete that flow.
//
// This lives under /api/auth/* but is NOT an @auth/core action (see is-auth-action.ts), so the
// auth middleware passes it through to this route. It requires no session — it's called from the
// signed-out Welcome screen — and reveals only booleans, never any secret value.
export async function GET() {
  return Response.json(socialEnabled(process.env), {
    // Cheap to compute and rarely changes; let the client cache briefly.
    headers: { "Cache-Control": "public, max-age=300" },
  });
}

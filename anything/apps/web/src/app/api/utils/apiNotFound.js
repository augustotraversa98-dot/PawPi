// JSON 404 for any /api/* path no route handler claimed.
//
// Registered in __create/index.ts AFTER every real /api route (app.route(API_BASENAME, api)), so it only ever
// sees requests nothing else answered. Without it those fell through to the React Router SPA catch-all and came
// back as HTTP 200 + HTML, which API clients and monitors cannot tell apart from success.
//
// The body is a fixed object: nothing from the request (path, query, headers) is echoed back.
export const API_NOT_FOUND_BODY = { error: 'not_found' };

export function apiNotFound(c) {
  return c.json(API_NOT_FOUND_BODY, 404);
}

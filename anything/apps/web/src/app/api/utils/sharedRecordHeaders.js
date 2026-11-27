// Response headers of the shared record page (/shared-record, opened with a pet owner's record link): nothing of it is
// cached, indexed or passed on as a referrer. Set by the server because the page build keeps only a page's component,
// so a route-level `headers` export would not reach the response. The API answers it reads set their own no-store.

// With or without a trailing slash, and the ".data" form the router may ask for. The router ignores case.
const SHARED_RECORD_PATH = /^\/+shared-record(\.data)?\/*$/i;

export function sharedRecordHeaders() {
  return async (c, next) => {
    await next();
    if (!SHARED_RECORD_PATH.test(c.req.path)) return;
    c.res.headers.set('Cache-Control', 'no-store');
    c.res.headers.set('Referrer-Policy', 'no-referrer');
    c.res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  };
}

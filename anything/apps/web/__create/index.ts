import { AsyncLocalStorage } from 'node:async_hooks';
import nodeConsole from 'node:console';
import Credentials from '@auth/core/providers/credentials';
import { authHandler, initAuthConfig } from '@hono/auth-js';
import pg from 'pg';
import { hash, verify } from 'argon2';
import { Hono } from 'hono';
import { contextStorage, getContext } from 'hono/context-storage';
import { cors } from 'hono/cors';
import { proxy } from 'hono/proxy';
import { bodyLimit } from 'hono/body-limit';
import { requestId } from 'hono/request-id';
import { createHonoServer } from 'react-router-hono-server/node';
import { serializeError } from 'serialize-error';
import NeonAdapter from './adapter';
import { getHTMLForErrorPage } from './get-html-for-error-page';
import { isAuthAction } from './is-auth-action';
import { API_BASENAME, api } from './route-builder';

const { Pool } = pg;

const als = new AsyncLocalStorage<{ requestId: string }>();

for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
  const original = nodeConsole[method].bind(console);

  console[method] = (...args: unknown[]) => {
    const requestId = als.getStore()?.requestId;
    if (requestId) {
      original(`[traceId:${requestId}]`, ...args);
    } else {
      original(...args);
    }
  };
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const adapter = NeonAdapter(pool);

const app = new Hono();

app.use('*', requestId());

app.use('*', (c, next) => {
  const requestId = c.get('requestId');
  return als.run({ requestId }, () => next());
});

app.use(contextStorage());

app.onError((err, c) => {
  // Always log the full error server-side (the console override above tags it
  // with the request's traceId). Never ship stack traces / DB internals / server
  // file paths to the client in production — found leaking on every unhandled
  // error (e.g. a Postgres constraint violation) via serializeError(err) below.
  console.error('[onError]', err);

  if (process.env.NODE_ENV !== 'production') {
    if (c.req.method !== 'GET') {
      return c.json(
        {
          error: 'An error occurred in your app',
          details: serializeError(err),
        },
        500
      );
    }
    // Dev-only sandbox preview page (postMessage handshake for an iframe-embedded
    // preview) — never appropriate in production, and was hardcoded to HTTP 200
    // even for genuine errors, which hid real failures from any status-based
    // monitoring. Real status code even in dev, since 200-for-an-error is never
    // correct regardless of environment.
    return c.html(getHTMLForErrorPage(err), 500);
  }

  return c.json({ error: 'Internal server error' }, 500);
});

if (process.env.CORS_ORIGINS) {
  app.use(
    '/*',
    cors({
      origin: process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
    })
  );
}
for (const method of ['post', 'put', 'patch'] as const) {
  app[method](
    '*',
    bodyLimit({
      // Was 4.5mb to match a Vercel constraint that no longer applies on
      // Railway. Too small for real camera photos and outright blocks the
      // daily-video-moments feature; 50mb matches Supabase Storage's default
      // per-file limit. A rejected request over the limit also resets the
      // connection mid-upload (Hono aborts before draining the body) rather
      // than failing cleanly, which surfaces to native fetch as a generic
      // "Network request failed" instead of the intended 413 — raising the
      // cap keeps real uploads well clear of that edge case.
      maxSize: 50 * 1024 * 1024,
      onError: (c) => {
        return c.json({ error: 'Body size limit exceeded' }, 413);
      },
    })
  );
}

if (process.env.AUTH_SECRET) {
  app.use(
    '*',
    initAuthConfig((c) => ({
      secret: c.env.AUTH_SECRET,
      // Auth routes are mounted at /api/auth (see app.use('/api/auth/*') below),
      // so basePath is always /api/auth. Pin it explicitly instead of letting
      // @auth/core derive it from new URL(AUTH_URL).pathname: off-platform,
      // AUTH_URL is a bare origin (http://localhost:4000) whose pathname is '/',
      // which makes the action parser read '/api/auth/csrf' as a 3-segment path
      // and throw UnknownAction. (On the Anything platform AUTH_URL carried the
      // /api/auth path, masking this.)
      basePath: '/api/auth',
      // Derive the auth origin from the incoming request host instead of a fixed
      // AUTH_URL. AUTH_URL is intentionally unset off-platform: with it set,
      // @hono/auth-js's reqWithEnvUrl rewrites every request's origin to AUTH_URL,
      // so a device authenticating against the LAN host (192.168.x.x:4000) got a
      // post-login redirect to http://localhost:4000/... — unreachable on the
      // phone (iOS -1004). With AUTH_URL unset, the origin follows the request's
      // host/x-forwarded-host header (the WebView sends the LAN host), so the
      // redirect lands back on the same origin the WebView can reach and the
      // ${baseURL}/api/auth/token interception matches. trustHost must be pinned
      // explicitly: setEnvDefaults only auto-enables it when AUTH_URL (or
      // VERCEL/CF_PAGES/non-prod NODE_ENV) is present, which it no longer is.
      // Keeping basePath pinned (not AUTH_URL) is also what clears the
      // env-url-basepath-redundant warning, which only fires when both are set.
      trustHost: true,
      pages: {
        signIn: '/account/signin',
        signOut: '/account/logout',
      },
      // NOTE: do NOT set `skipCSRFCheck` off-platform. The Anything platform
      // served /api/auth/csrf at its edge, so the client always got a token even
      // with CSRF "skipped". Off-platform we rely on @auth/core directly, which
      // returns 404 for /api/auth/csrf when skipCSRFCheck is set — and the auth
      // client (getCsrfToken -> signIn) treats that token as mandatory, so every
      // sign-in/sign-up aborts with "Unexpected end of JSON input". Leaving CSRF
      // enabled makes /csrf return a real token; validation works same-origin
      // (web localhost) and on device given the protocol-aware cookies below.
      session: {
        strategy: 'jwt',
      },
      callbacks: {
        session({ session, token }) {
          if (token.sub) {
            session.user.id = token.sub;
          }
          return session;
        },
      },
      // Cookie security must follow the deployment protocol. On the Anything
      // platform AUTH_URL was https, so Secure + SameSite=None was correct (and
      // needed for the cross-site mobile WebView). Off-platform we serve plain
      // http (AUTH_URL=http://localhost:4000, and the device WebView hits a LAN
      // http origin) — a hardcoded Secure cookie is silently dropped by the
      // browser/WebView on any non-localhost http origin, so no session sticks.
      // Derive the flags from the protocol: https keeps the platform behaviour,
      // http uses non-Secure + Lax (fine for the first-party local/LAN flow).
      // AUTH_URL alone isn't enough off-platform: it's intentionally unset both
      // for local/LAN http AND for the real https Railway deploy (trustHost —
      // see comment above), so checking only AUTH_URL left Railway's genuinely
      // https traffic with non-Secure cookies. @auth/core's default cookie
      // names still carry the __Host-/__Secure- prefixes, which browsers and
      // WKWebView silently reject unless Secure is actually set — breaking
      // CSRF validation and login entirely. Fall back to the TLS-terminating
      // proxy's forwarded-proto header (Railway, like other PaaS, sets this).
      cookies: (() => {
        const useSecure =
          (c.env.AUTH_URL ?? '').startsWith('https') ||
          c.req.header('x-forwarded-proto') === 'https';
        const options = {
          secure: useSecure,
          sameSite: useSecure ? ('none' as const) : ('lax' as const),
        };
        return {
          csrfToken: { options },
          sessionToken: { options },
          callbackUrl: { options },
        };
      })(),
      providers: [
        // Dev-only provider for simulated social sign-in (Google, Facebook, etc.)
        // Creates or finds a user by email without requiring a password.
        ...(process.env.NEXT_PUBLIC_CREATE_ENV === 'DEVELOPMENT'
          ? [
              Credentials({
                id: 'dev-social',
                name: 'Development Social Sign-in',
                credentials: {
                  email: { label: 'Email', type: 'email' },
                  name: { label: 'Name', type: 'text' },
                  provider: { label: 'Provider', type: 'text' },
                },
                authorize: async (credentials) => {
                  const { email, name, provider } = credentials;
                  if (!email || typeof email !== 'string') return null;

                  const existing = await adapter.getUserByEmail(email);
                  if (existing) return existing;

                  const allowedProviders = new Set(['google', 'facebook', 'twitter', 'apple']);
                  const providerName =
                    typeof provider === 'string' && allowedProviders.has(provider.toLowerCase())
                      ? provider.toLowerCase()
                      : 'google';
                  const newUser = await adapter.createUser({
                    emailVerified: null,
                    email,
                    name:
                      typeof name === 'string' && name.length > 0
                        ? name
                        : undefined,
                  });
                  await adapter.linkAccount({
                    type: 'oauth',
                    userId: newUser.id,
                    provider: providerName,
                    providerAccountId: `dev-${newUser.id}`,
                  });
                  return newUser;
                },
              }),
            ]
          : []),
        Credentials({
          id: 'credentials-signin',
          name: 'Credentials Sign in',
          credentials: {
            email: {
              label: 'Email',
              type: 'email',
            },
            password: {
              label: 'Password',
              type: 'password',
            },
          },
          authorize: async (credentials) => {
            const { email, password } = credentials;
            if (!email || !password) {
              return null;
            }
            if (typeof email !== 'string' || typeof password !== 'string') {
              return null;
            }

            // logic to verify if user exists
            const user = await adapter.getUserByEmail(email);
            if (!user) {
              return null;
            }
            const matchingAccount = user.accounts.find(
              (account) => account.provider === 'credentials'
            );
            const accountPassword = matchingAccount?.password;
            if (!accountPassword) {
              return null;
            }

            const isValid = await verify(accountPassword, password);
            if (!isValid) {
              return null;
            }

            // return user object with the their profile data
            return user;
          },
        }),
        Credentials({
          id: 'credentials-signup',
          name: 'Credentials Sign up',
          credentials: {
            email: {
              label: 'Email',
              type: 'email',
            },
            password: {
              label: 'Password',
              type: 'password',
            },
            name: { label: 'Name', type: 'text' },
            image: { label: 'Image', type: 'text', required: false },
          },
          authorize: async (credentials) => {
            const { email, password, name, image } = credentials;
            if (!email || !password) {
              return null;
            }
            if (typeof email !== 'string' || typeof password !== 'string') {
              return null;
            }

            // logic to verify if user exists
            const user = await adapter.getUserByEmail(email);
            if (!user) {
              const newUser = await adapter.createUser({
                emailVerified: null,
                email,
                name: typeof name === 'string' && name.length > 0 ? name : undefined,
                image: typeof image === 'string' && image.length > 0 ? image : undefined,
              });
              await adapter.linkAccount({
                extraData: {
                  password: await hash(password),
                },
                type: 'credentials',
                userId: newUser.id,
                providerAccountId: newUser.id,
                provider: 'credentials',
              });
              return newUser;
            }
            return null;
          },
        }),
      ],
    }))
  );
}
app.all('/integrations/:path{.+}', async (c, next) => {
  const queryParams = c.req.query();
  const url = `${process.env.NEXT_PUBLIC_CREATE_BASE_URL ?? 'https://www.create.xyz'}/integrations/${c.req.param('path')}${Object.keys(queryParams).length > 0 ? `?${new URLSearchParams(queryParams).toString()}` : ''}`;

  return proxy(url, {
    method: c.req.method,
    body: c.req.raw.body ?? null,
    // @ts-expect-error -- duplex is accepted by the runtime even though the
    // type declarations don't include it; required for streaming integrations
    duplex: 'half',
    redirect: 'manual',
    headers: {
      ...c.req.header(),
      'X-Forwarded-For': process.env.NEXT_PUBLIC_CREATE_HOST,
      'x-createxyz-host': process.env.NEXT_PUBLIC_CREATE_HOST,
      Host: process.env.NEXT_PUBLIC_CREATE_HOST,
      'x-createxyz-project-group-id': process.env.NEXT_PUBLIC_PROJECT_GROUP_ID,
    },
  });
});

app.use('/api/auth/*', async (c, next) => {
  if (isAuthAction(c.req.path)) {
    return authHandler()(c, next);
  }
  return next();
});
app.route(API_BASENAME, api);

const serverPromise = createHonoServer({
  app,
  defaultLogger: false,
  // Production listen config (ignored in dev, where Vite owns the server).
  // The host injects PORT; hostname 0.0.0.0 so the container's mapped port is
  // reachable. No URL here — Auth.js origin stays request-derived (trustHost).
  port: Number(process.env.PORT) || 4000,
  hostname: '0.0.0.0',
});

// Dev needs the resolved Hono app as the default export (Vite mounts it as
// middleware). In production the export is unused — createHonoServer calls
// serve() itself — and a top-level await here deadlocks: this entry chunk
// would suspend while dynamic-importing server-build.js, which statically
// imports back into this chunk for shared app modules (ESM TLA cycle).
export default (import.meta.env.DEV ? await serverPromise : serverPromise);

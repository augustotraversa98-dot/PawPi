import { getToken } from '@auth/core/jwt';

// #4 (night-run S4) — the WebView auth-success bridge. This page hands the caller's JWT to
// window.parent via postMessage. Previously it targeted '*' (any parent origin), so any page that
// framed this one could read the token. The mobile receiver (AuthWebView.jsx) already verifies
// event.origin === EXPO_PUBLIC_PROXY_BASE_URL, so the correct target is the app's own web origin —
// which is AUTH_URL (the same origin that serves these auth pages). We fall back to the permissive
// '*' ONLY in development, never in production.
//
// HELD FOR REVIEW (auth-core-adjacent): confirm on-device login still works and that the production
// AUTH_URL / APP_WEB_ORIGIN origin matches EXPO_PUBLIC_PROXY_BASE_URL before shipping.
function resolveTargetOrigin() {
	const configured = process.env.APP_WEB_ORIGIN || process.env.AUTH_URL;
	if (configured) {
		try {
			return new URL(configured).origin;
		} catch {
			// fall through to the environment-gated wildcard
		}
	}
	const isProd = process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_CREATE_ENV !== 'DEVELOPMENT';
	return isProd ? null : '*';
}

// Serialize for safe embedding inside an inline <script>: escaping `<` prevents a `</script>`
// breakout via the (provider-controlled) name/email fields.
function inlineJson(value) {
	return JSON.stringify(value).replace(/</g, '\\u003c');
}

function page(bodyScript, status = 200) {
	return new Response(
		`
		<html>
			<body>
				<script>${bodyScript}</script>
			</body>
		</html>
		`,
		{ status, headers: { 'Content-Type': 'text/html' } },
	);
}

export async function GET(request) {
	// See src/app/api/auth/token/route.js — same forwarded-proto fix.
	const isSecure =
		process.env.AUTH_URL?.startsWith('https') ||
		request.headers.get('x-forwarded-proto') === 'https' ||
		(request.url?.startsWith('https') ?? false);
	const [token, jwt] = await Promise.all([
		getToken({
			req: request,
			secret: process.env.AUTH_SECRET,
			secureCookie: isSecure,
			raw: true,
		}),
		getToken({
			req: request,
			secret: process.env.AUTH_SECRET,
			secureCookie: isSecure,
		}),
	]);

	const targetOrigin = resolveTargetOrigin();
	// Production with no configured origin: refuse to broadcast the token rather than post to '*'.
	if (targetOrigin === null) {
		console.error('[auth/expo-web-success] No APP_WEB_ORIGIN/AUTH_URL configured; refusing to post token.');
		return page(
			`window.parent.postMessage({ type: 'AUTH_ERROR', error: 'Auth origin not configured' }, self.origin);`,
			500,
		);
	}

	if (!jwt) {
		return page(
			`window.parent.postMessage({ type: 'AUTH_ERROR', error: 'Unauthorized' }, ${inlineJson(targetOrigin)});`,
			401,
		);
	}

	const message = {
		type: 'AUTH_SUCCESS',
		jwt: token,
		user: {
			id: jwt.sub,
			email: jwt.email,
			name: jwt.name,
		},
	};

	return page(
		`window.parent.postMessage(${inlineJson(message)}, ${inlineJson(targetOrigin)});`,
	);
}

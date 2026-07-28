import { getToken } from '@auth/core/jwt';
export async function GET(request) {
	// request.url reflects the app's internal (Railway-forwarded) scheme, which
	// is plain http even when the client connected over real https — check the
	// TLS-terminating proxy's forwarded-proto header first. See __create/index.ts
	// cookies comment for the full story (same bug, this is the token-fetch half).
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

	if (!jwt) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	}

	return new Response(
		JSON.stringify({
			jwt: token,
			user: {
				id: jwt.sub,
				email: jwt.email,
				name: jwt.name,
			},
		}),
		{
			headers: {
				'Content-Type': 'application/json',
			},
		}
	);
}

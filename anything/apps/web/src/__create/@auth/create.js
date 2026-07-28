import { getToken } from '@auth/core/jwt';
import { getContext } from 'hono/context-storage';

export default function CreateAuth() {
	const auth = async () => {
		const c = getContext();
		// See src/app/api/auth/token/route.js — same forwarded-proto fix. This one
		// was worse: AUTH_URL unset made secureCookie always false, so this shim
		// (used by every server-side auth() check) never found the real session
		// cookie on the live https deploy.
		const token = await getToken({
			req: c.req.raw,
			secret: process.env.AUTH_SECRET,
			secureCookie:
				process.env.AUTH_URL?.startsWith('https') || c.req.header('x-forwarded-proto') === 'https',
		});
		if (token) {
			return {
				user: {
					id: token.sub,
					email: token.email,
					name: token.name,
					image: token.picture,
				},
				expires: token.exp.toString(),
			};
		}
	};
	return {
		auth,
	};
}

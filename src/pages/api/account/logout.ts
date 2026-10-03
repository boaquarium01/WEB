import type { APIRoute } from 'astro';
import { getAuth } from '../../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async (context) => {
	try {
		const signedOut = await getAuth().api.signOut({
			headers: context.request.headers,
			asResponse: true,
		});

		const redirect = new Response(null, {
			status: 302,
			headers: {
				Location: '/',
			},
		});

		// Preserve Set-Cookie from Better Auth (clear session)
		for (const cookie of signedOut.headers.getSetCookie?.() ?? []) {
			redirect.headers.append('Set-Cookie', cookie);
		}

		// Fallback for runtimes without getSetCookie()
		const single = signedOut.headers.get('set-cookie');
		if (single && !(signedOut.headers.getSetCookie?.().length)) {
			redirect.headers.append('Set-Cookie', single);
		}

		return redirect;
	} catch {
		return context.redirect('/');
	}
};

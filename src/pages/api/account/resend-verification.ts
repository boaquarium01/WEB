import type { APIRoute } from 'astro';
import { getAuth } from '../../../lib/auth';
import { isAuthEmailConfigured } from '../../../lib/email/adapter';

export const prerender = false;

export const POST: APIRoute = async ({ request, url }) => {
	if (!isAuthEmailConfigured()) return Response.json({ ok: true });
	const body = await request.json().catch(() => ({})) as { email?: string };
	const email = body.email?.trim();
	if (email && email.length < 255) {
		try {
			await getAuth().api.sendVerificationEmail({ body: { email, callbackURL: `${url.origin}/account/verify-email` } });
		} catch {
			// Keep responses indistinguishable for unknown addresses and provider errors.
		}
	}
	return Response.json({ ok: true });
};

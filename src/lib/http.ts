import type { APIContext } from 'astro';

export function jsonError(message: string, status = 400): Response {
	return new Response(JSON.stringify({ ok: false, error: message }), {
		status,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
}

export function jsonOk(data: unknown, status = 200): Response {
	return new Response(JSON.stringify({ ok: true, data }), {
		status,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
}

export function requireUser(context: APIContext) {
	if (!context.locals.user) {
		return null;
	}
	return context.locals.user;
}

/** Require a browser mutation to originate from the same V2 origin. */
export function hasSameOrigin(request: Request, origin: string): boolean {
	return request.headers.get('origin') === origin;
}

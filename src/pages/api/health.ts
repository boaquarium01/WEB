import type { APIRoute } from 'astro';
import { pingDatabase } from '../../lib/db/client';
import { pingSanity } from '../../lib/sanity/client';

export const prerender = false;

export const GET: APIRoute = async () => {
	const checks: Record<string, unknown> = {
		service: 'boaquarium-v2',
		phase: 10,
	};

	try {
		checks.database = await pingDatabase();
	} catch (error) {
		checks.database = {
			ok: false,
			error: error instanceof Error ? error.message : 'Unknown database error',
		};
	}

	try {
		checks.sanity = await pingSanity();
	} catch (error) {
		checks.sanity = {
			ok: false,
			error: error instanceof Error ? error.message : 'Unknown Sanity error',
		};
	}

	const databaseOk =
		typeof checks.database === 'object' &&
		checks.database !== null &&
		'ok' in checks.database &&
		checks.database.ok === true;

	const sanityOk =
		typeof checks.sanity === 'object' &&
		checks.sanity !== null &&
		'ok' in checks.sanity &&
		checks.sanity.ok === true;

	const ok = databaseOk && sanityOk;

	return new Response(
		JSON.stringify(
			{
				ok,
				...checks,
			},
			null,
			2,
		),
		{
			status: ok ? 200 : 503,
			headers: {
				'Content-Type': 'application/json; charset=utf-8',
				'Cache-Control': 'no-store',
			},
		},
	);
};

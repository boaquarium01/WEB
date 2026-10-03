/**
 * Obscure admin URL slug — same pattern as V1:
 * `/admin/{ADMIN_PATH_SLUG}/dashboard`
 */
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: '.env' });

const ADMIN_PATH_SLUG_RE = /^[a-zA-Z0-9_-]{20,48}$/;
/** Dev fallback when ADMIN_PATH_SLUG is unset (must stay 20–48 chars). */
const DEV_DEFAULT_ADMIN_PATH_SLUG = 'xGKRlrsak8BPKVIocxGZVkGzdr_k';

function readAdminPathSlugEnv(): string {
	const fromProcess =
		typeof process !== 'undefined' && typeof process.env?.ADMIN_PATH_SLUG === 'string'
			? process.env.ADMIN_PATH_SLUG.trim()
			: '';
	let fromMeta = '';
	try {
		fromMeta = String(import.meta.env.ADMIN_PATH_SLUG ?? '').trim();
	} catch {
		/* ignore */
	}
	return fromProcess || fromMeta;
}

export function getAdminPathSlug(): string {
	const raw = readAdminPathSlugEnv();
	if (ADMIN_PATH_SLUG_RE.test(raw)) return raw;
	try {
		if (import.meta.env.DEV) return DEV_DEFAULT_ADMIN_PATH_SLUG;
	} catch {
		/* Node scripts */
		if (process.env.NODE_ENV !== 'production') return DEV_DEFAULT_ADMIN_PATH_SLUG;
	}
	return '';
}

/** `/admin/{slug}` — no trailing slash */
export function getAdminBasePath(): string {
	const slug = getAdminPathSlug();
	if (!slug) return '';
	return `/admin/${slug}`;
}

export function isValidAdminSecretParam(param: string | undefined): boolean {
	const slug = getAdminPathSlug();
	if (!slug) return false;
	return String(param ?? '').trim() === slug;
}

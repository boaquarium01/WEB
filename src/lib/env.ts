import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Ensure .env is available on process.env during `astro dev` / Node SSR.
// (Vite also exposes values via import.meta.env; we read both below.)
loadDotenv({ path: '.env' });

/**
 * Server-only environment variables.
 * Never prefix secrets with PUBLIC_.
 *
 * Astro/Vite exposes .env via import.meta.env (SSR).
 * Node scripts (tsx / drizzle) typically use process.env via dotenv.
 * Always read both — with static keys so Vite can inline them.
 */
const serverEnvSchema = z.object({
	DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
	BETTER_AUTH_SECRET: z
		.string()
		.min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
	BETTER_AUTH_URL: z.string().url('BETTER_AUTH_URL must be a valid URL'),
	GOOGLE_CLIENT_ID: z.string().optional(),
	GOOGLE_CLIENT_SECRET: z.string().optional(),
	LINE_CHANNEL_ID: z.string().optional(),
	LINE_CHANNEL_SECRET: z.string().optional(),
	/** Optional read token; write token must never be exposed to the browser. */
	SANITY_API_READ_TOKEN: z.string().optional(),
	/** Optional Resend credentials used for account recovery emails. */
	RESEND_API_KEY: z.string().optional(),
	/** Gmail API offline grant used only by the V2 server mailer. */
	GMAIL_API_REFRESH_TOKEN: z.string().optional(),
	AUTH_EMAIL_FROM: z.string().optional(),
	PASSWORD_RESET_FROM_EMAIL: z.string().optional(),
});

const publicEnvSchema = z.object({
	PUBLIC_SITE_URL: z.string().url(),
	PUBLIC_SANITY_PROJECT_ID: z.string().min(1),
	PUBLIC_SANITY_DATASET: z.string().min(1),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type PublicEnv = z.infer<typeof publicEnvSchema>;

let cachedServerEnv: ServerEnv | null = null;

function readServerVar(
	key:
		| 'DATABASE_URL'
		| 'BETTER_AUTH_SECRET'
		| 'BETTER_AUTH_URL'
		| 'GOOGLE_CLIENT_ID'
		| 'GOOGLE_CLIENT_SECRET'
		| 'LINE_CHANNEL_ID'
		| 'LINE_CHANNEL_SECRET'
		| 'SANITY_API_READ_TOKEN'
		| 'RESEND_API_KEY'
		| 'GMAIL_API_REFRESH_TOKEN'
		| 'AUTH_EMAIL_FROM'
		| 'PASSWORD_RESET_FROM_EMAIL',
): string | undefined {
	const fromProcess = process.env[key];
	if (fromProcess && fromProcess.length > 0) {
		return fromProcess;
	}

	// Static property access is required for Vite to expose these values.
	// Under plain Node/tsx, import.meta.env may be undefined.
	const meta = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
	if (!meta) {
		return undefined;
	}

	const fromMeta = (() => {
		switch (key) {
			case 'DATABASE_URL':
				return meta.DATABASE_URL;
			case 'BETTER_AUTH_SECRET':
				return meta.BETTER_AUTH_SECRET;
			case 'BETTER_AUTH_URL':
				return meta.BETTER_AUTH_URL;
			case 'GOOGLE_CLIENT_ID':
				return meta.GOOGLE_CLIENT_ID;
			case 'GOOGLE_CLIENT_SECRET':
				return meta.GOOGLE_CLIENT_SECRET;
			case 'LINE_CHANNEL_ID':
				return meta.LINE_CHANNEL_ID;
			case 'LINE_CHANNEL_SECRET':
				return meta.LINE_CHANNEL_SECRET;
			case 'SANITY_API_READ_TOKEN':
				return meta.SANITY_API_READ_TOKEN;
			case 'RESEND_API_KEY':
				return meta.RESEND_API_KEY;
			case 'GMAIL_API_REFRESH_TOKEN':
				return meta.GMAIL_API_REFRESH_TOKEN;
			case 'AUTH_EMAIL_FROM':
				return meta.AUTH_EMAIL_FROM;
			case 'PASSWORD_RESET_FROM_EMAIL':
				return meta.PASSWORD_RESET_FROM_EMAIL;
			default:
				return undefined;
		}
	})();

	if (typeof fromMeta === 'string' && fromMeta.length > 0) {
		return fromMeta;
	}

	return undefined;
}

function readPublicVar(key: keyof PublicEnv): string | undefined {
	const fromProcess = process.env[key];
	if (fromProcess && fromProcess.length > 0) {
		return fromProcess;
	}

	const meta = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
	if (!meta) {
		return undefined;
	}

	const fromMeta = (() => {
		switch (key) {
			case 'PUBLIC_SITE_URL':
				return meta.PUBLIC_SITE_URL;
			case 'PUBLIC_SANITY_PROJECT_ID':
				return meta.PUBLIC_SANITY_PROJECT_ID;
			case 'PUBLIC_SANITY_DATASET':
				return meta.PUBLIC_SANITY_DATASET;
			default:
				return undefined;
		}
	})();

	if (typeof fromMeta === 'string' && fromMeta.length > 0) {
		return fromMeta;
	}

	return undefined;
}

export function getServerEnv(): ServerEnv {
	if (cachedServerEnv) {
		return cachedServerEnv;
	}

	const parsed = serverEnvSchema.safeParse({
		DATABASE_URL: readServerVar('DATABASE_URL'),
		BETTER_AUTH_SECRET: readServerVar('BETTER_AUTH_SECRET'),
		BETTER_AUTH_URL: readServerVar('BETTER_AUTH_URL'),
		GOOGLE_CLIENT_ID: readServerVar('GOOGLE_CLIENT_ID'),
		GOOGLE_CLIENT_SECRET: readServerVar('GOOGLE_CLIENT_SECRET'),
		LINE_CHANNEL_ID: readServerVar('LINE_CHANNEL_ID'),
		LINE_CHANNEL_SECRET: readServerVar('LINE_CHANNEL_SECRET'),
		SANITY_API_READ_TOKEN: readServerVar('SANITY_API_READ_TOKEN'),
		RESEND_API_KEY: readServerVar('RESEND_API_KEY'),
		GMAIL_API_REFRESH_TOKEN: readServerVar('GMAIL_API_REFRESH_TOKEN'),
		AUTH_EMAIL_FROM: readServerVar('AUTH_EMAIL_FROM'),
		PASSWORD_RESET_FROM_EMAIL: readServerVar('PASSWORD_RESET_FROM_EMAIL'),
	});

	if (!parsed.success) {
		const details = parsed.error.issues
			.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
			.join('; ');
		throw new Error(`Invalid server environment: ${details}`);
	}

	cachedServerEnv = parsed.data;
	return cachedServerEnv;
}

export function getPublicEnv(): PublicEnv {
	const parsed = publicEnvSchema.safeParse({
		PUBLIC_SITE_URL: readPublicVar('PUBLIC_SITE_URL'),
		PUBLIC_SANITY_PROJECT_ID: readPublicVar('PUBLIC_SANITY_PROJECT_ID'),
		PUBLIC_SANITY_DATASET: readPublicVar('PUBLIC_SANITY_DATASET'),
	});

	if (!parsed.success) {
		const details = parsed.error.issues
			.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
			.join('; ');
		throw new Error(`Invalid public environment: ${details}`);
	}

	return parsed.data;
}

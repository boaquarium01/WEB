/// <reference types="astro/client" />

interface ImportMetaEnv {
	readonly PUBLIC_SITE_URL: string;
	readonly PUBLIC_SANITY_PROJECT_ID: string;
	readonly PUBLIC_SANITY_DATASET: string;
	/** Server-only (available in SSR via import.meta.env; never send to browser). */
	readonly DATABASE_URL?: string;
	readonly BETTER_AUTH_SECRET?: string;
	readonly BETTER_AUTH_URL?: string;
	readonly GOOGLE_CLIENT_ID?: string;
	readonly GOOGLE_CLIENT_SECRET?: string;
	readonly LINE_CHANNEL_ID?: string;
	readonly LINE_CHANNEL_SECRET?: string;
	readonly SANITY_API_READ_TOKEN?: string;
	readonly RESEND_API_KEY?: string;
	readonly GMAIL_API_REFRESH_TOKEN?: string;
	readonly AUTH_EMAIL_FROM?: string;
	readonly PASSWORD_RESET_FROM_EMAIL?: string;
	readonly ADMIN_EMAILS?: string;
	readonly ADMIN_PATH_SLUG?: string;
	readonly PUBLIC_BANK_NAME?: string;
	readonly PUBLIC_BANK_ACCOUNT_NAME?: string;
	readonly PUBLIC_BANK_ACCOUNT_NUMBER?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

type AuthSession = NonNullable<
	Awaited<
		ReturnType<ReturnType<typeof import('./lib/auth').getAuth>['api']['getSession']>
	>
>;

declare namespace App {
	interface Locals {
		user: AuthSession['user'] | null;
		session: AuthSession['session'] | null;
		isAdmin: boolean;
	}
}

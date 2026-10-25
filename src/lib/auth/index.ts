import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { genericOAuth, line } from 'better-auth/plugins/generic-oauth';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { getServerEnv } from '../env';
import { sendAuthEmail } from '../email/adapter';
import { ensureCustomerForUser } from '../services/customer';
import { isSyntheticProviderEmail } from './policies.js';

function createAuth() {
	const env = getServerEnv();
	const db = getDb();
	const lineProvider = env.LINE_CHANNEL_ID && env.LINE_CHANNEL_SECRET
		? {
				...line({
					providerId: 'line',
					clientId: env.LINE_CHANNEL_ID,
					clientSecret: env.LINE_CHANNEL_SECRET,
					// LINE email is optional and requires a separate permission grant.
					scopes: ['openid', 'profile'],
				}),
				// Always load the subject from LINE's authenticated UserInfo endpoint;
				// do not trust an unverified decoded ID-token payload as the account key.
				getUserInfo: async (tokens: { accessToken?: string | null }) => {
					if (!tokens.accessToken) return null;
					const response = await fetch('https://api.line.me/oauth2/v2.1/userinfo', {
						headers: { Authorization: `Bearer ${tokens.accessToken}` },
					});
					if (!response.ok) return null;
					const profile = await response.json() as { sub?: unknown; name?: unknown; picture?: unknown };
					if (typeof profile.sub !== 'string' || !profile.sub) return null;
					return {
						sub: profile.sub,
						name: typeof profile.name === 'string' && profile.name.trim() ? profile.name : 'LINE 會員',
						// Better Auth's user.email is required. This non-deliverable address
						// is never used as the member's contact email or identity key.
						email: `line-${encodeURIComponent(profile.sub)}@line-user.invalid`,
						emailVerified: false,
						image: typeof profile.picture === 'string' ? profile.picture : undefined,
					};
				},
			}
		: null;

	return betterAuth({
		database: drizzleAdapter(db, {
			provider: 'pg',
			schema: {
				user: schema.user,
				session: schema.session,
				account: schema.account,
				verification: schema.verification,
				rateLimit: schema.rateLimit,
			},
		}),
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		socialProviders: {
			...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? {
				google: {
					clientId: env.GOOGLE_CLIENT_ID,
					clientSecret: env.GOOGLE_CLIENT_SECRET,
					requireEmailVerification: true,
				},
			} : {}),
		},
		plugins: lineProvider ? [genericOAuth({ config: [lineProvider] })] : [],
		account: {
			accountLinking: {
				enabled: true,
				disableImplicitLinking: true,
				// Allow explicit linking from the signed-in security page. This does not
				// enable email-based auto-merging because implicit linking stays disabled.
				trustedProviders: ['google', 'line'],
				allowDifferentEmails: true,
				allowUnlinkingAll: false,
			},
		},
		emailAndPassword: {
			enabled: true,
			minPasswordLength: 8,
			requireEmailVerification: true,
			resetPasswordTokenExpiresIn: 60 * 60,
			revokeSessionsOnPasswordReset: true,
			onExistingUserSignUp: async () => undefined,
			sendResetPassword: async ({ user, url }) => {
				if (isSyntheticProviderEmail(user.email)) return;
				await sendAuthEmail({
					to: user.email,
					subject: '重設您的水博館水族會員密碼',
					text: `您好，我們收到重設水博館水族會員密碼的請求。請點選下方連結，在一小時內設定新密碼：\n\n${url}\n\n若連結已逾期，請重新申請密碼重設。完成重設前，您的原密碼仍可使用。若您未提出此請求，請忽略此信。`,
				});
			},
		},
		emailVerification: {
			sendOnSignUp: true,
			sendOnSignIn: true,
			autoSignInAfterVerification: false,
			expiresIn: 60 * 60,
			sendVerificationEmail: async ({ user, url }) => {
				if (isSyntheticProviderEmail(user.email)) return;
				await sendAuthEmail({
					to: user.email,
					subject: '驗證您的水博館水族會員 Email',
					text: `您好，感謝您註冊水博館水族會員。請點選下方連結，在一小時內完成 Email 驗證；驗證完成後即可登入會員中心：\n\n${url}\n\n若連結已逾期，請回到登入頁重新寄送驗證信。若您未申請註冊，請忽略此信。`,
				});
			},
		},
		rateLimit: {
			enabled: true,
			storage: 'database',
			window: 60,
			max: 100,
			customRules: {
				'/sign-in/email': { window: 60, max: 5 },
				'/sign-up/email': { window: 60, max: 5 },
				'/request-password-reset': { window: 60, max: 1 },
				'/send-verification-email': { window: 60, max: 3 },
				'/sign-in/social': { window: 60, max: 10 },
			},
		},
		advanced: {
			useSecureCookies: env.BETTER_AUTH_URL.startsWith('https://'),
		},
		trustedOrigins: [
			env.BETTER_AUTH_URL,
			...(process.env.NODE_ENV === 'production'
				? []
				: ['http://localhost:4321', 'http://127.0.0.1:4321']),
		],
		databaseHooks: {
			user: {
				create: {
				after: async (createdUser, context) => {
					await ensureCustomerForUser(createdUser.id, createdUser.name, createdUser.email);
					const isSocialSignUp = Boolean(context?.path?.includes('/callback/'));
					if (isSocialSignUp) {
						await db.update(schema.customers).set({
							contactEmail: isSyntheticProviderEmail(createdUser.email) ? null : createdUser.email,
							onboardingCompleted: false,
							updatedAt: new Date(),
						}).where(eq(schema.customers.userId, createdUser.id));
					}
				},
				},
			},
		},
	});
}

type AuthInstance = ReturnType<typeof createAuth>;

let auth: AuthInstance | null = null;

/**
 * Better Auth instance (server-only).
 */
export function getAuth(): AuthInstance {
	if (!auth) {
		auth = createAuth();
	}
	return auth;
}

export type { AuthInstance };

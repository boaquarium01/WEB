import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { genericOAuth, line } from 'better-auth/plugins/generic-oauth';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { getServerEnv } from '../env';
import { getRequestScope } from '../request-scope';
import { sendAuthEmail } from '../email/adapter';
import { passwordResetEmail, verificationOtpEmail } from '../email/templates';
import { ensureCustomerForUser } from '../services/customer';
import { isSyntheticProviderEmail, passwordPolicyMessage } from './policies.js';

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
		plugins: [
			...(lineProvider ? [genericOAuth({ config: [lineProvider] })] : []),
			emailOTP({
				otpLength: 6,
				expiresIn: 10 * 60,
				allowedAttempts: 3,
				storeOTP: 'hashed',
				disableSignUp: true,
				overrideDefaultEmailVerification: true,
				sendVerificationOTP: async ({ email, otp, type }) => {
					if (type !== 'email-verification' || isSyntheticProviderEmail(email)) return;
					// .test 是保留網域，寄了只會退信；本機測試時改印在終端機
					if (email.endsWith('.test')) {
						if (import.meta.env?.DEV) console.info(`[email-otp] ${email} 驗證碼 ${otp}`);
						return;
					}
					await sendAuthEmail({ to: email, ...verificationOtpEmail(otp) });
				},
			}),
		],
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
		// 註冊、重設、修改、設定密碼一律套用同一份密碼規則（見 policies.js）
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				const field = ctx.path === '/sign-up/email' ? 'password' : ['/reset-password', '/change-password', '/set-password'].includes(ctx.path) ? 'newPassword' : null;
				if (!field) return;
				const message = passwordPolicyMessage(String(ctx.body?.[field] ?? ''));
				if (message) throw new APIError('BAD_REQUEST', { message });
			}),
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
				await sendAuthEmail({ to: user.email, ...passwordResetEmail(url) });
			},
		},
		emailVerification: {
			sendOnSignUp: true,
			sendOnSignIn: true,
			// 輸入驗證碼成功後直接登入，不用再輸入一次帳密
			autoSignInAfterVerification: true,
		},
		// 只開放「寄驗證碼」與「驗證 Email」；其他驗證碼功能目前用不到
		disabledPaths: [
			'/sign-in/email-otp',
			'/email-otp/check-verification-otp',
			'/email-otp/request-password-reset',
			'/forget-password/email-otp',
			'/email-otp/reset-password',
			'/email-otp/request-email-change',
			'/email-otp/change-email',
		],
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
				'/email-otp/send-verification-otp': { window: 60, max: 2 },
				'/email-otp/verify-email': { window: 60, max: 10 },
				'/sign-in/social': { window: 60, max: 10 },
			},
		},
		advanced: {
			useSecureCookies: env.BETTER_AUTH_URL.startsWith('https://'),
			ipAddress: { ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'] },
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
	// 綁定了當次請求的資料庫連線，所以 Workers 上每次請求各建一個
	const scope = getRequestScope();
	if (scope) {
		scope.auth ??= createAuth();
		return scope.auth as AuthInstance;
	}
	if (!auth) {
		auth = createAuth();
	}
	return auth;
}

export type { AuthInstance };

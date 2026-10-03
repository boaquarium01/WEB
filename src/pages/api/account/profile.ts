import type { APIRoute } from 'astro';
import { jsonError, jsonOk, requireUser, hasSameOrigin } from '../../../lib/http';
import {
	ensureCustomerForUser,
	getCustomerByUserId,
	updateCustomerProfile,
} from '../../../lib/services/customer';
import { getDb } from '../../../lib/db/client';
import { customers } from '../../../lib/db/schema';
import { eq } from 'drizzle-orm';
import { isSyntheticProviderEmail } from '../../../lib/auth/policies.js';

export const prerender = false;

export const GET: APIRoute = async (context) => {
	const user = requireUser(context);
	if (!user) return jsonError('Unauthorized', 401);

	const customer = await ensureCustomerForUser(user.id, user.name);
	return jsonOk({
		user: {
			id: user.id,
			email: isSyntheticProviderEmail(user.email) ? null : user.email,
			name: user.name,
		},
		customer,
	});
};

export const PATCH: APIRoute = async (context) => {
	if (!hasSameOrigin(context.request, context.url.origin)) return jsonError('請重新整理頁面後再試', 403);
	const user = requireUser(context);
	if (!user) return jsonError('Unauthorized', 401);

	let displayName: string | undefined;
	let phone: string | undefined;
	let contactEmail: string | undefined;
	let acceptedTerms = false;
	let completeOnboarding = false;

	try {
		const body = (await context.request.json()) as {
			displayName?: string;
			phone?: string;
			contactEmail?: string;
			acceptedTerms?: boolean;
			completeOnboarding?: boolean;
		};
		displayName = body.displayName;
		phone = body.phone;
		contactEmail = body.contactEmail;
		acceptedTerms = body.acceptedTerms === true;
		completeOnboarding = body.completeOnboarding === true;
	} catch {
		return jsonError('Invalid JSON body');
	}

	try {
		const customer = await updateCustomerProfile(user.id, {
			displayName,
			phone,
			contactEmail,
		});
		const current = await getCustomerByUserId(user.id);
		if (completeOnboarding) {
			if (!current?.termsAcceptedAt && !acceptedTerms) {
				return jsonError('請先同意服務條款', 400);
			}
			const db = getDb();
			await db.update(customers).set({
				termsAcceptedAt: current?.termsAcceptedAt ?? (acceptedTerms ? new Date() : null),
				onboardingCompleted: true,
				updatedAt: new Date(),
			}).where(eq(customers.userId, user.id));
		}
		return jsonOk(customer);
	} catch (error) {
		return jsonError(
			error instanceof Error ? error.message : '更新失敗',
			400,
		);
	}
};

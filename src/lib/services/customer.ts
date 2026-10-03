import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { customers } from '../db/schema';
import { isSyntheticProviderEmail } from '../auth/policies.js';

export type Customer = typeof customers.$inferSelect;

/**
 * Ensure a customer row exists for the Better Auth user.
 * Safe to call repeatedly (idempotent).
 */
export async function ensureCustomerForUser(
	userId: string,
	displayName?: string | null,
	contactEmail?: string | null,
): Promise<Customer> {
	const db = getDb();
	const [existing] = await db
		.select()
		.from(customers)
		.where(eq(customers.userId, userId))
		.limit(1);

	if (existing) {
		return existing;
	}

	const [created] = await db
		.insert(customers)
		.values({
			userId,
			displayName: displayName?.trim() || null,
			contactEmail: contactEmail && isSyntheticProviderEmail(contactEmail) ? null : contactEmail?.trim() || null,
		})
		.returning();

	if (!created) {
		throw new Error('Failed to create customer profile');
	}

	return created;
}

export async function getCustomerByUserId(
	userId: string,
): Promise<Customer | null> {
	const db = getDb();
	const [row] = await db
		.select()
		.from(customers)
		.where(eq(customers.userId, userId))
		.limit(1);
	return row ?? null;
}

export async function updateCustomerProfile(
	userId: string,
	input: { displayName?: string; phone?: string; contactEmail?: string; bankAccountLastFive?: string },
): Promise<Customer> {
	const bankAccountLastFive = input.bankAccountLastFive?.trim() ?? '';
	if (bankAccountLastFive && !/^\d{5}$/.test(bankAccountLastFive)) {
		throw new Error('常用轉帳帳號末五碼請輸入 5 位數字');
	}
	const contactEmail = input.contactEmail?.trim() ?? '';
	if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
		throw new Error('請輸入有效的聯絡 Email');
	}
	const customer = await ensureCustomerForUser(userId, input.displayName);
	const db = getDb();

	const [updated] = await db
		.update(customers)
		.set({
			displayName:
				input.displayName !== undefined
					? input.displayName.trim() || null
					: customer.displayName,
		phone:
			input.phone !== undefined ? input.phone.trim() || null : customer.phone,
		contactEmail:
			input.contactEmail !== undefined ? contactEmail || null : customer.contactEmail,
			bankAccountLastFive:
				input.bankAccountLastFive !== undefined
					? bankAccountLastFive || null
					: customer.bankAccountLastFive,
			updatedAt: new Date(),
		})
		.where(eq(customers.id, customer.id))
		.returning();

	if (!updated) {
		throw new Error('Failed to update customer profile');
	}

	return updated;
}

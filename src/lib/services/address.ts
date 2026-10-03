import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { addresses } from '../db/schema';
import { ensureCustomerForUser } from './customer';

export type Address = typeof addresses.$inferSelect;

export type AddressInput = {
	label?: string;
	recipientName: string;
	phone: string;
	postalCode: string;
	city: string;
	district: string;
	addressLine: string;
	isDefault?: boolean;
};

async function getOwnedCustomerId(userId: string): Promise<string> {
	const customer = await ensureCustomerForUser(userId);
	return customer.id;
}

export async function listAddressesForUser(userId: string): Promise<Address[]> {
	const customerId = await getOwnedCustomerId(userId);
	const db = getDb();
	return db
		.select()
		.from(addresses)
		.where(eq(addresses.customerId, customerId))
		.orderBy(desc(addresses.isDefault), desc(addresses.createdAt));
}

/** Owned address only; returns null if missing or not owned by user. */
export async function getAddressForUser(
	userId: string,
	addressId: string,
): Promise<Address | null> {
	const customerId = await getOwnedCustomerId(userId);
	const db = getDb();
	const [row] = await db
		.select()
		.from(addresses)
		.where(
			and(eq(addresses.id, addressId), eq(addresses.customerId, customerId)),
		)
		.limit(1);
	return row ?? null;
}

export async function createAddressForUser(
	userId: string,
	input: AddressInput,
): Promise<Address> {
	validateAddressInput(input);
	const customerId = await getOwnedCustomerId(userId);
	const db = getDb();

	if (input.isDefault) {
		await db
			.update(addresses)
			.set({ isDefault: false, updatedAt: new Date() })
			.where(eq(addresses.customerId, customerId));
	}

	const [created] = await db
		.insert(addresses)
		.values({
			customerId,
			label: input.label?.trim() || null,
			recipientName: input.recipientName.trim(),
			phone: input.phone.trim(),
			postalCode: input.postalCode.trim(),
			city: input.city.trim(),
			district: input.district.trim(),
			addressLine: input.addressLine.trim(),
			isDefault: Boolean(input.isDefault),
		})
		.returning();

	if (!created) {
		throw new Error('Failed to create address');
	}

	return created;
}

export async function updateAddressForUser(
	userId: string,
	addressId: string,
	input: Partial<AddressInput>,
): Promise<Address> {
	const customerId = await getOwnedCustomerId(userId);
	const db = getDb();

	const [owned] = await db
		.select()
		.from(addresses)
		.where(
			and(eq(addresses.id, addressId), eq(addresses.customerId, customerId)),
		)
		.limit(1);

	if (!owned) {
		throw new Error('Address not found');
	}

	if (input.isDefault) {
		await db
			.update(addresses)
			.set({ isDefault: false, updatedAt: new Date() })
			.where(eq(addresses.customerId, customerId));
	}

	const [updated] = await db
		.update(addresses)
		.set({
			label:
				input.label !== undefined ? input.label.trim() || null : owned.label,
			recipientName:
				input.recipientName !== undefined
					? input.recipientName.trim()
					: owned.recipientName,
			phone: input.phone !== undefined ? input.phone.trim() : owned.phone,
			postalCode:
				input.postalCode !== undefined
					? input.postalCode.trim()
					: owned.postalCode,
			city: input.city !== undefined ? input.city.trim() : owned.city,
			district:
				input.district !== undefined ? input.district.trim() : owned.district,
			addressLine:
				input.addressLine !== undefined
					? input.addressLine.trim()
					: owned.addressLine,
			isDefault:
				input.isDefault !== undefined
					? Boolean(input.isDefault)
					: owned.isDefault,
			updatedAt: new Date(),
		})
		.where(eq(addresses.id, owned.id))
		.returning();

	if (!updated) {
		throw new Error('Failed to update address');
	}

	return updated;
}

export async function deleteAddressForUser(
	userId: string,
	addressId: string,
): Promise<void> {
	const customerId = await getOwnedCustomerId(userId);
	const db = getDb();

	const deleted = await db
		.delete(addresses)
		.where(
			and(eq(addresses.id, addressId), eq(addresses.customerId, customerId)),
		)
		.returning({ id: addresses.id });

	if (deleted.length === 0) {
		throw new Error('Address not found');
	}
}

function validateAddressInput(input: AddressInput): void {
	const required = [
		input.recipientName,
		input.phone,
		input.postalCode,
		input.city,
		input.district,
		input.addressLine,
	];
	if (required.some((v) => !v?.trim())) {
		throw new Error('收件資訊不完整');
	}
}

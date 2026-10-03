import { asc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { shippingMethods } from '../db/schema';

export type ShippingMethod = typeof shippingMethods.$inferSelect;

export async function listShippingMethods(activeOnly = false): Promise<ShippingMethod[]> {
	const db = getDb();
	const query = db.select().from(shippingMethods);
	return activeOnly
		? query.where(eq(shippingMethods.isActive, true)).orderBy(asc(shippingMethods.sortOrder), asc(shippingMethods.createdAt))
		: query.orderBy(asc(shippingMethods.sortOrder), asc(shippingMethods.createdAt));
}

export async function saveShippingMethod(input: {
	id?: string;
	name: string;
	fee: number;
	freeShippingThreshold: number | null;
	isActive: boolean;
}): Promise<void> {
	const name = input.name.trim();
	if (!name || name.length > 60) throw new Error('配送方式名稱需為 1 至 60 個字');
	if (!Number.isSafeInteger(input.fee) || input.fee < 0) throw new Error('運費必須是大於或等於 0 的整數');
	if (input.freeShippingThreshold !== null && (!Number.isSafeInteger(input.freeShippingThreshold) || input.freeShippingThreshold < 0)) {
		throw new Error('免運門檻必須是大於或等於 0 的整數');
	}
	const db = getDb();
	if (input.id) {
		await db.update(shippingMethods).set({
			name,
			fee: input.fee,
			freeShippingThreshold: input.freeShippingThreshold,
			isActive: input.isActive,
			updatedAt: new Date(),
		}).where(eq(shippingMethods.id, input.id));
		return;
	}
	const maxOrder = await db.select({ sortOrder: shippingMethods.sortOrder }).from(shippingMethods).orderBy(asc(shippingMethods.sortOrder));
	await db.insert(shippingMethods).values({
		code: `delivery-${crypto.randomUUID()}`,
		name,
		fee: input.fee,
		freeShippingThreshold: input.freeShippingThreshold,
		isActive: input.isActive,
		sortOrder: maxOrder.length ? Math.max(...maxOrder.map((row) => row.sortOrder)) + 1 : 0,
	});
}

export function getShippingFee(method: Pick<ShippingMethod, 'fee' | 'freeShippingThreshold'>, subtotal: number): number {
	return method.freeShippingThreshold !== null && subtotal >= method.freeShippingThreshold ? 0 : method.fee;
}

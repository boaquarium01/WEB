import { and, asc, desc, eq } from 'drizzle-orm';
import { availableStock } from '../db/inventory';
import { getDb } from '../db/client';
import {
	inventory,
	inventoryMovements,
	locations,
	productSkus,
	products,
} from '../db/schema';

export type InventoryRow = {
	inventoryId: string;
	productSkuId: string;
	productId: string;
	productName: string;
	slug: string;
	sku: string;
	skuName: string;
	locationId: string;
	locationName: string;
	locationType: string;
	onHand: number;
	reserved: number;
	available: number;
	lowStockThreshold: number;
	isLowStock: boolean;
	updatedAt: Date;
};

export type InventoryMovementRow = {
	id: string;
	productSkuId: string;
	sku: string;
	productName: string;
	locationName: string;
	type: string;
	quantity: number;
	beforeQuantity: number;
	afterQuantity: number;
	referenceType: string | null;
	referenceId: string | null;
	note: string | null;
	createdBy: string | null;
	createdAt: Date;
};

export type ManualMovementType = 'ADJUSTMENT';

export type AdjustInventoryInput = {
	productSkuId: string;
	/** Relative change to on_hand (can be negative). */
	delta: number;
	type?: ManualMovementType;
	note?: string;
	locationId?: string;
	createdBy?: string | null;
};

/**
 * Resolve active STORE location (default stock site for online).
 */
export async function getStoreLocation() {
	const db = getDb();
	const [store] = await db
		.select()
		.from(locations)
		.where(and(eq(locations.type, 'STORE'), eq(locations.isActive, true)))
		.orderBy(asc(locations.createdAt))
		.limit(1);
	return store ?? null;
}

/**
 * List inventory joined with product / SKU / location.
 */
export async function listInventory(options?: {
	lowStockOnly?: boolean;
	locationId?: string;
}): Promise<InventoryRow[]> {
	const db = getDb();

	const query = db
		.select({
			inventoryId: inventory.id,
			productSkuId: inventory.productSkuId,
			productId: products.id,
			productName: products.name,
			slug: products.slug,
			sku: productSkus.sku,
			skuName: productSkus.name,
			locationId: locations.id,
			locationName: locations.name,
			locationType: locations.type,
			onHand: inventory.onHand,
			reserved: inventory.reserved,
			lowStockThreshold: inventory.lowStockThreshold,
			updatedAt: inventory.updatedAt,
		})
		.from(inventory)
		.innerJoin(productSkus, eq(inventory.productSkuId, productSkus.id))
		.innerJoin(products, eq(productSkus.productId, products.id))
		.innerJoin(locations, eq(inventory.locationId, locations.id));

	const rows = options?.locationId
		? await query
				.where(eq(inventory.locationId, options.locationId))
				.orderBy(asc(products.name), asc(productSkus.sku))
		: await query.orderBy(asc(products.name), asc(productSkus.sku));

	const mapped = rows.map((row) => {
		const available = availableStock(row.onHand, row.reserved);
		return {
			...row,
			available,
			isLowStock: available >= 0 && available <= row.lowStockThreshold,
		};
	});

	if (options?.lowStockOnly) {
		return mapped.filter((r) => r.isLowStock);
	}
	return mapped;
}

/**
 * Recent inventory movements (audit log).
 */
export async function listInventoryMovements(options?: {
	limit?: number;
	productSkuId?: string;
}): Promise<InventoryMovementRow[]> {
	const db = getDb();
	const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);

	const base = db
		.select({
			id: inventoryMovements.id,
			productSkuId: inventoryMovements.productSkuId,
			sku: productSkus.sku,
			productName: products.name,
			locationName: locations.name,
			type: inventoryMovements.type,
			quantity: inventoryMovements.quantity,
			beforeQuantity: inventoryMovements.beforeQuantity,
			afterQuantity: inventoryMovements.afterQuantity,
			referenceType: inventoryMovements.referenceType,
			referenceId: inventoryMovements.referenceId,
			note: inventoryMovements.note,
			createdBy: inventoryMovements.createdBy,
			createdAt: inventoryMovements.createdAt,
		})
		.from(inventoryMovements)
		.innerJoin(
			productSkus,
			eq(inventoryMovements.productSkuId, productSkus.id),
		)
		.innerJoin(products, eq(productSkus.productId, products.id))
		.innerJoin(locations, eq(inventoryMovements.locationId, locations.id));

	const rows = options?.productSkuId
		? await base
				.where(eq(inventoryMovements.productSkuId, options.productSkuId))
				.orderBy(desc(inventoryMovements.createdAt))
				.limit(limit)
		: await base.orderBy(desc(inventoryMovements.createdAt)).limit(limit);

	return rows;
}

/**
 * Adjust on_hand with a mandatory inventory_movement (transaction + FOR UPDATE).
 * Never allows on_hand < reserved.
 */
export async function adjustInventory(
	input: AdjustInventoryInput,
): Promise<InventoryRow> {
	const productSkuId = String(input.productSkuId ?? '').trim();
	const delta = Number(input.delta);
	const type = input.type ?? 'ADJUSTMENT';
	const note = String(input.note ?? '').trim() || null;

	if (!productSkuId) {
		throw new Error('缺少 SKU');
	}
	if (!Number.isInteger(delta) || delta === 0) {
		throw new Error('調整數量必須為非零整數');
	}
	if (type !== 'ADJUSTMENT') {
		throw new Error('不支援的異動類型');
	}

	const db = getDb();

	await db.transaction(async (tx) => {
		let locationId = input.locationId?.trim() || null;
		if (!locationId) {
			const [store] = await tx
				.select()
				.from(locations)
				.where(
					and(eq(locations.type, 'STORE'), eq(locations.isActive, true)),
				)
				.orderBy(asc(locations.createdAt))
				.limit(1);
			if (!store) {
				throw new Error('尚未設定 STORE 庫存地點');
			}
			locationId = store.id;
		}

		const [sku] = await tx
			.select({ id: productSkus.id })
			.from(productSkus)
			.where(eq(productSkus.id, productSkuId))
			.limit(1);
		if (!sku) {
			throw new Error('找不到 SKU');
		}

		const [existing] = await tx
			.select()
			.from(inventory)
			.where(
				and(
					eq(inventory.productSkuId, productSkuId),
					eq(inventory.locationId, locationId),
				),
			)
			.for('update');

		let inventoryId: string;
		let before: number;
		let after: number;
		let reserved: number;

		if (!existing) {
			if (delta < 0) {
				throw new Error('尚無庫存列，無法減少庫存');
			}
			before = 0;
			after = delta;
			reserved = 0;
			const [created] = await tx
				.insert(inventory)
				.values({
					productSkuId,
					locationId,
					onHand: after,
					reserved: 0,
					lowStockThreshold: 2,
				})
				.returning();
			if (!created) {
				throw new Error('無法建立庫存列');
			}
			inventoryId = created.id;
		} else {
			before = existing.onHand;
			if (before < 0) {
				throw new Error('此 SKU 為不限量庫存；請到商品目錄直接設定數量');
			}
			after = before + delta;
			reserved = existing.reserved;
			if (after < 0) {
				throw new Error('庫存不可為負數');
			}
			if (after < reserved) {
				throw new Error(
					`無法調整：在庫 ${after} 不得低於已預留 ${reserved}`,
				);
			}
			await tx
				.update(inventory)
				.set({
					onHand: after,
					updatedAt: new Date(),
				})
				.where(eq(inventory.id, existing.id));
			inventoryId = existing.id;
		}

		await tx.insert(inventoryMovements).values({
			productSkuId,
			locationId,
			type,
			quantity: Math.abs(delta),
			beforeQuantity: before,
			afterQuantity: after,
			referenceType: 'manual_adjustment',
			referenceId: inventoryId,
			note:
				note ??
				(delta > 0
					? `手動入庫 +${delta}`
					: `手動調整 ${delta}（${type}）`),
			createdBy: input.createdBy ?? null,
		});
	});

	const rows = await listInventory();
	const row = rows.find((r) => r.productSkuId === productSkuId);
	if (!row) {
		throw new Error('調整後無法讀取庫存');
	}
	return row;
}

export async function updateLowStockThreshold(
	inventoryId: string,
	threshold: number,
): Promise<void> {
	if (!Number.isInteger(threshold) || threshold < 0) {
		throw new Error('低庫存門檻必須為非負整數');
	}
	const db = getDb();
	const updated = await db
		.update(inventory)
		.set({
			lowStockThreshold: threshold,
			updatedAt: new Date(),
		})
		.where(eq(inventory.id, inventoryId))
		.returning({ id: inventory.id });

	if (updated.length === 0) {
		throw new Error('找不到庫存列');
	}
}

export function movementTypeLabel(type: string): string {
	const map: Record<string, string> = {
		ONLINE_SALE: '線上銷售／預留',
		RETURN: '退回／釋放預留',
		ADJUSTMENT: '調整',
		PURCHASE: '採購',
		POS_SALE: 'POS 銷售',
		TRANSFER_IN: '調入',
		TRANSFER_OUT: '調出',
	};
	return map[type] ?? type;
}

/** Count rows where available <= threshold (for future admin dashboard). */
export async function countLowStock(): Promise<number> {
	const rows = await listInventory({ lowStockOnly: true });
	return rows.length;
}

// re-export helper for callers
export { availableStock };

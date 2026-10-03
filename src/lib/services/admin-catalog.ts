import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import {
	inventory,
	inventoryMovements,
	locations,
	productSkus,
	products,
} from '../db/schema';

export type AdminSkuRow = {
	productId: string;
	productName: string;
	slug: string;
	productType: string;
	productActive: boolean;
	productOnline: boolean;
	productSkuId: string;
	sku: string;
	skuName: string;
	sellingPrice: number;
	onHand: number;
	reserved: number;
	updatedAt: Date;
};

export async function listAdminSkus(): Promise<AdminSkuRow[]> {
	const db = getDb();
	const [store] = await db
		.select({ id: locations.id })
		.from(locations)
		.where(and(eq(locations.type, 'STORE'), eq(locations.isActive, true)))
		.orderBy(asc(locations.createdAt))
		.limit(1);

	const query = db
		.select({
			productId: products.id,
			productName: products.name,
			slug: products.slug,
			productType: products.productType,
			productActive: products.isActive,
			productOnline: products.isOnline,
			productSkuId: productSkus.id,
			sku: productSkus.sku,
			skuName: productSkus.name,
			sellingPrice: productSkus.sellingPrice,
			onHand: inventory.onHand,
			reserved: inventory.reserved,
			updatedAt: productSkus.updatedAt,
		})
		.from(productSkus)
		.innerJoin(products, eq(productSkus.productId, products.id));

	const rows = store
		? await query
				.leftJoin(
					inventory,
					and(
						eq(inventory.productSkuId, productSkus.id),
						eq(inventory.locationId, store.id),
					),
				)
				.orderBy(asc(products.name), asc(productSkus.sku))
		: await query.orderBy(asc(products.name), asc(productSkus.sku));

	return rows.map((row) => ({
		...row,
		onHand: row.onHand ?? -1,
		reserved: row.reserved ?? 0,
	}));
}

export async function updateSkuCommerceSettings(input: {
	productSkuId: string;
	sellingPrice: number;
	onHand: number;
	createdBy: string | null;
}): Promise<void> {
	const productSkuId = String(input.productSkuId ?? '').trim();
	const sellingPrice = Number(input.sellingPrice);
	const onHand = Number(input.onHand);
	if (!productSkuId) throw new Error('找不到商品規格');
	if (!Number.isInteger(sellingPrice) || sellingPrice < 0) {
		throw new Error('價格請輸入 0 或以上的整數');
	}
	if (!Number.isInteger(onHand) || onHand < -1) {
		throw new Error('庫存請輸入「-」或 0 以上的整數');
	}

	const db = getDb();
	await db.transaction(async (tx) => {
		const [sku] = await tx
			.select({ id: productSkus.id, sellingPrice: productSkus.sellingPrice })
			.from(productSkus)
			.where(eq(productSkus.id, productSkuId))
			.for('update')
			.limit(1);
		if (!sku) throw new Error('找不到商品規格');

		const [store] = await tx
			.select({ id: locations.id })
			.from(locations)
			.where(and(eq(locations.type, 'STORE'), eq(locations.isActive, true)))
			.orderBy(asc(locations.createdAt))
			.limit(1);
		if (!store) throw new Error('尚未設定 STORE 庫存地點');

		const [existing] = await tx
			.select()
			.from(inventory)
			.where(
				and(
					eq(inventory.productSkuId, productSkuId),
					eq(inventory.locationId, store.id),
				),
			)
			.for('update')
			.limit(1);
		const before = existing?.onHand ?? -1;
		const reserved = existing?.reserved ?? 0;
		if (onHand >= 0 && onHand < reserved) {
			throw new Error(`庫存不能低於已預留數量 ${reserved}`);
		}

		await tx
			.update(productSkus)
			.set({ sellingPrice, updatedAt: new Date() })
			.where(eq(productSkus.id, productSkuId));

		let inventoryId = existing?.id;
		if (existing) {
			await tx
				.update(inventory)
				.set({ onHand, updatedAt: new Date() })
				.where(eq(inventory.id, existing.id));
		} else {
			const [created] = await tx
				.insert(inventory)
				.values({
					productSkuId,
					locationId: store.id,
					onHand,
					reserved: 0,
					lowStockThreshold: 2,
				})
				.returning({ id: inventory.id });
			inventoryId = created?.id;
		}

		if (before !== onHand && inventoryId) {
			await tx.insert(inventoryMovements).values({
				productSkuId,
				locationId: store.id,
				type: 'ADJUSTMENT',
				quantity: before < 0 || onHand < 0 ? 0 : Math.abs(onHand - before),
				beforeQuantity: before,
				afterQuantity: onHand,
				referenceType: 'manual_adjustment',
				referenceId: inventoryId,
				note:
					before < 0 || onHand < 0
						? `庫存模式變更：${before < 0 ? '不限量' : before} → ${onHand < 0 ? '不限量' : onHand}`
						: `商品目錄直接設定庫存 ${before} → ${onHand}`,
				createdBy: input.createdBy,
			});
		}
	});
}

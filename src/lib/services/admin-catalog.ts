import { and, asc, eq, inArray, notInArray } from 'drizzle-orm';
import { getDb } from '../db/client';
import { validateQuantityPriceTiers } from './quantity-pricing';
import {
	inventory,
	inventoryMovements,
	locations,
	productSkus,
	productPriceTiers,
	products,
} from '../db/schema';

export type AdminSkuRow = {
	productId: string;
	sanityProductId: string;
	productName: string;
	slug: string;
	productType: string;
	productActive: boolean;
	productOnline: boolean;
	productSkuId: string;
	variantKey: string | null;
	skuActive: boolean;
	saleEnabled: boolean;
	sku: string;
	barcode: string | null;
	preparationDays: number | null;
	skuName: string;
	sellingPrice: number;
	onHand: number;
	reserved: number;
	updatedAt: Date;
};

export async function listAdminSkus(filter: { sanityProductId?: string; slug?: string } = {}): Promise<AdminSkuRow[]> {
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
			sanityProductId: products.sanityProductId,
			productName: products.name,
			slug: products.slug,
			productType: products.productType,
			productActive: products.isActive,
			productOnline: products.isOnline,
			productSkuId: productSkus.id,
			variantKey: productSkus.variantKey,
			skuActive: productSkus.isActive,
			saleEnabled: productSkus.saleEnabled,
			sku: productSkus.sku,
			sourceSku: productSkus.sourceSku,
			barcode: productSkus.barcode,
			preparationDays: productSkus.preparationDays,
			skuName: productSkus.name,
			sellingPrice: productSkus.sellingPrice,
			onHand: inventory.onHand,
			reserved: inventory.reserved,
			updatedAt: productSkus.updatedAt,
		})
		.from(productSkus)
		.innerJoin(products, eq(productSkus.productId, products.id))
		.where(filter.sanityProductId ? eq(products.sanityProductId, filter.sanityProductId) : filter.slug ? eq(products.slug, filter.slug) : undefined);

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

export type ProductPriceTierInput = {
	minQuantity: number;
	maxQuantity: number | null;
	unitPrice: number;
};

export async function getProductSalesSettings(sanityProductId: string) {
	const db = getDb();
	const [product] = await db.select({
		id: products.id,
		minimumPurchaseQuantity: products.minimumPurchaseQuantity,
	}).from(products).where(eq(products.sanityProductId, sanityProductId)).limit(1);
	if (!product) throw new Error('找不到商品');
	const tiers = await db.select({
		id: productPriceTiers.id,
		minQuantity: productPriceTiers.minQuantity,
		maxQuantity: productPriceTiers.maxQuantity,
		unitPrice: productPriceTiers.unitPrice,
	}).from(productPriceTiers).where(eq(productPriceTiers.productId, product.id)).orderBy(asc(productPriceTiers.sortOrder), asc(productPriceTiers.minQuantity));
	return { minimumPurchaseQuantity: product.minimumPurchaseQuantity, priceTiers: tiers };
}

type CatalogTransaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];
export type SkuCommerceChange = {
  productSkuId: string; sellingPrice?: number; onHand?: number; saleEnabled?: boolean; sku?: string;
  barcode?: string | null; preparationDays?: number | null;
};
export type SalesSettingsChange = { minimumPurchaseQuantity?: number; priceTiers?: ProductPriceTierInput[] };

export async function updateProductSalesSettings(input: SalesSettingsChange & { sanityProductId: string }, transaction?: CatalogTransaction): Promise<void> {
  const minimum = input.minimumPurchaseQuantity;
  if (minimum !== undefined && (!Number.isInteger(minimum) || minimum < 1 || minimum > 999999)) throw new Error('最低購買數量須為 1 至 999999 的整數');
  const tiers = input.priceTiers;
  if (tiers !== undefined) {
    if (!Array.isArray(tiers) || tiers.length > 10) throw new Error('多件優惠最多設定 10 個區間');
    const error = validateQuantityPriceTiers(tiers); if (error) throw new Error(error);
  }
  const apply = async (tx: CatalogTransaction) => {
    const [product] = await tx.select({ id: products.id, minimum: products.minimumPurchaseQuantity }).from(products).where(eq(products.sanityProductId, input.sanityProductId)).for('update').limit(1);
    if (!product) throw new Error('找不到商品');
    if (minimum !== undefined && minimum !== product.minimum) await tx.update(products).set({ minimumPurchaseQuantity: minimum, updatedAt: new Date() }).where(eq(products.id, product.id));
    if (tiers !== undefined) {
      const current = await tx.select({ minQuantity: productPriceTiers.minQuantity, maxQuantity: productPriceTiers.maxQuantity, unitPrice: productPriceTiers.unitPrice }).from(productPriceTiers).where(eq(productPriceTiers.productId, product.id)).orderBy(asc(productPriceTiers.sortOrder));
      if (JSON.stringify(current) !== JSON.stringify(tiers)) {
        await tx.delete(productPriceTiers).where(eq(productPriceTiers.productId, product.id));
        if (tiers.length) await tx.insert(productPriceTiers).values(tiers.map((tier, index) => ({ productId: product.id, ...tier, sortOrder: index })));
      }
    }
  };
  if (transaction) await apply(transaction); else await getDb().transaction(apply);
}

export async function updateSkuCommerceSettings(input: SkuCommerceChange & { createdBy: string | null }, transaction?: CatalogTransaction): Promise<void> {
  const { productSkuId, sellingPrice, onHand } = input;
  if (input.saleEnabled !== undefined && typeof input.saleEnabled !== 'boolean') throw new Error('販售狀態無效');
  if (!productSkuId) throw new Error('找不到商品規格');
  if (sellingPrice !== undefined && (!Number.isInteger(sellingPrice) || sellingPrice < 0)) throw new Error('價格請輸入 0 或以上的整數');
  if (onHand !== undefined && (!Number.isInteger(onHand) || onHand < -1)) throw new Error('庫存請輸入 -1 或 0 以上的整數');
  if (input.sku !== undefined && (!input.sku.trim() || input.sku.trim().length > 64)) throw new Error('賣家商品貨號不可空白且最多 64 字');
  if (input.barcode && input.barcode.length > 64) throw new Error('國際條碼最多 64 字');
  if (input.preparationDays != null && (!Number.isInteger(input.preparationDays) || input.preparationDays < 0 || input.preparationDays > 365)) throw new Error('備貨天數須為 0 至 365 的整數');
  const apply = async (tx: CatalogTransaction) => {
    const [sku] = await tx.select().from(productSkus).where(eq(productSkus.id, productSkuId)).for('update').limit(1);
    if (!sku) throw new Error('找不到商品規格');
    const patch: Partial<typeof productSkus.$inferInsert> = {};
    if (input.saleEnabled !== undefined && input.saleEnabled !== sku.saleEnabled) patch.saleEnabled = input.saleEnabled;
    if (sellingPrice !== undefined && sellingPrice !== sku.sellingPrice) patch.sellingPrice = sellingPrice;
    if (input.sku !== undefined && input.sku.trim() !== sku.sku) { patch.sku = input.sku.trim(); patch.sourceSku = sku.sourceSku ?? sku.sku; }
    if (input.barcode !== undefined && (input.barcode?.trim() || null) !== sku.barcode) patch.barcode = input.barcode?.trim() || null;
    if (input.preparationDays !== undefined && input.preparationDays !== sku.preparationDays) patch.preparationDays = input.preparationDays;
    if (Object.keys(patch).length) await tx.update(productSkus).set({ ...patch, updatedAt: new Date() }).where(eq(productSkus.id, productSkuId));
    if (onHand === undefined) return;
    const [store] = await tx.select({ id: locations.id }).from(locations).where(and(eq(locations.type, 'STORE'), eq(locations.isActive, true))).orderBy(asc(locations.createdAt)).limit(1);
    if (!store) throw new Error('尚未設定 STORE 庫存地點');
    const [existing] = await tx.select().from(inventory).where(and(eq(inventory.productSkuId, productSkuId), eq(inventory.locationId, store.id))).for('update').limit(1);
    const before = existing?.onHand ?? -1;
    if (onHand >= 0 && onHand < (existing?.reserved ?? 0)) throw new Error('庫存不能低於已預留數量 ' + existing!.reserved);
    if (before === onHand) return;
    let inventoryId = existing?.id;
    if (existing) await tx.update(inventory).set({ onHand, updatedAt: new Date() }).where(eq(inventory.id, existing.id));
    else {
      const [created] = await tx.insert(inventory).values({ productSkuId, locationId: store.id, onHand, reserved: 0, lowStockThreshold: 2 }).returning({ id: inventory.id }); inventoryId = created?.id;
    }
    if (inventoryId) await tx.insert(inventoryMovements).values({ productSkuId, locationId: store.id, type: 'ADJUSTMENT', quantity: before < 0 || onHand < 0 ? 0 : Math.abs(onHand - before), beforeQuantity: before, afterQuantity: onHand, referenceType: 'manual_adjustment', referenceId: inventoryId, note: '商品編輯庫存調整 ' + before + ' → ' + onHand, createdBy: input.createdBy });
  };
  if (transaction) await apply(transaction); else await getDb().transaction(apply);
}

/** Commit changed commerce fields together; an invalid row rolls back every SQL change. */
export async function saveProductCommerceChanges(input: { sanityProductId: string; changes: SkuCommerceChange[]; settings?: SalesSettingsChange; createdBy: string | null }): Promise<void> {
  if (input.changes.length > 100 || new Set(input.changes.map((row) => row.productSkuId)).size !== input.changes.length) throw new Error('規格更新數量無效');
  await getDb().transaction(async (tx) => {
    const [product] = await tx.select({ id: products.id }).from(products).where(eq(products.sanityProductId, input.sanityProductId)).for('update').limit(1);
    if (!product) throw new Error('找不到商品');
    const skus = await tx.select({ id: productSkus.id, sku: productSkus.sku, sourceSku: productSkus.sourceSku }).from(productSkus).where(eq(productSkus.productId, product.id));
    const ids = new Set(skus.map((sku) => sku.id));
    if (input.changes.some((row) => !ids.has(row.productSkuId))) throw new Error('規格不屬於此商品');
    // Release changing merchant codes first so a batch can safely swap two codes.
    const codeChanges = input.changes.filter((row) => row.sku !== undefined && row.sku.trim() !== skus.find((sku) => sku.id === row.productSkuId)?.sku);
    for (const row of codeChanges) {
      const original = skus.find((sku) => sku.id === row.productSkuId)!;
      await tx.update(productSkus).set({ sku: '__edit_' + crypto.randomUUID().replace(/-/g, ''), sourceSku: original.sourceSku ?? original.sku }).where(eq(productSkus.id, row.productSkuId));
    }
    for (const row of input.changes) await updateSkuCommerceSettings({ ...row, createdBy: input.createdBy }, tx);
    if (input.settings && Object.keys(input.settings).length) await updateProductSalesSettings({ ...input.settings, sanityProductId: input.sanityProductId }, tx);
  });
}

export async function updateBulkSkuCommerceSettings(input: {
	productSkuIds: string[];
	sellingPrice?: number;
	onHand?: number;
	skuCodes?: string[];
	createdBy: string | null;
}): Promise<void> {
	const ids = [...new Set(input.productSkuIds.map((id) => String(id).trim()).filter(Boolean))];
	if (!ids.length || ids.length > 100) throw new Error('批次套用規格數量無效');
	const sellingPrice = input.sellingPrice === undefined ? undefined : Number(input.sellingPrice);
	const onHand = input.onHand === undefined ? undefined : Number(input.onHand);
	const skuCodes = input.skuCodes?.map((code) => String(code).trim());
	if (sellingPrice === undefined && onHand === undefined && !skuCodes) throw new Error('請選擇要批次套用的欄位');
	if (sellingPrice !== undefined && (!Number.isInteger(sellingPrice) || sellingPrice < 0)) throw new Error('價格請輸入 0 或以上的整數');
	if (onHand !== undefined && (!Number.isInteger(onHand) || onHand < -1)) throw new Error('庫存請輸入「-」或 0 以上的整數');
	if (skuCodes && (skuCodes.length !== ids.length || skuCodes.some((code) => !code || code.length > 64) || new Set(skuCodes).size !== skuCodes.length)) throw new Error('批次貨號需為不重複且不超過 64 字的內容');

	const db = getDb();
	await db.transaction(async (tx) => {
		if (skuCodes) {
			const conflicts = await tx.select({ id: productSkus.id }).from(productSkus)
				.where(and(inArray(productSkus.sku, skuCodes), notInArray(productSkus.id, ids))).limit(1);
			if (conflicts.length) throw new Error('批次貨號與其他商品的貨號重複');
			for (const productSkuId of ids) await tx.update(productSkus)
				.set({ sku: `__bulk_${crypto.randomUUID().replace(/-/g, '')}`, updatedAt: new Date() })
				.where(eq(productSkus.id, productSkuId));
			for (const [index, productSkuId] of ids.entries()) await tx.update(productSkus)
				.set({ sku: skuCodes[index]!, updatedAt: new Date() }).where(eq(productSkus.id, productSkuId));
		}
		let storeId: string | undefined;
		if (onHand !== undefined) {
			const [store] = await tx.select({ id: locations.id }).from(locations)
				.where(and(eq(locations.type, 'STORE'), eq(locations.isActive, true)))
				.orderBy(asc(locations.createdAt)).limit(1);
			if (!store) throw new Error('尚未設定 STORE 庫存地點');
			storeId = store.id;
		}
		for (const productSkuId of ids) {
			const [sku] = await tx.select({ id: productSkus.id }).from(productSkus)
				.where(eq(productSkus.id, productSkuId)).for('update').limit(1);
			if (!sku) throw new Error('找不到商品規格');
			if (sellingPrice !== undefined) await tx.update(productSkus).set({ sellingPrice, updatedAt: new Date() }).where(eq(productSkus.id, productSkuId));
			if (onHand === undefined || !storeId) continue;
			const [existing] = await tx.select().from(inventory).where(and(eq(inventory.productSkuId, productSkuId), eq(inventory.locationId, storeId))).for('update').limit(1);
			const before = existing?.onHand ?? -1;
			const reserved = existing?.reserved ?? 0;
			if (onHand >= 0 && onHand < reserved) throw new Error(`庫存不能低於已預留數量 ${reserved}`);
			let inventoryId = existing?.id;
			if (existing) await tx.update(inventory).set({ onHand, updatedAt: new Date() }).where(eq(inventory.id, existing.id));
			else {
				const [created] = await tx.insert(inventory).values({ productSkuId, locationId: storeId, onHand, reserved: 0, lowStockThreshold: 2 }).returning({ id: inventory.id });
				inventoryId = created?.id;
			}
			if (before !== onHand && inventoryId) await tx.insert(inventoryMovements).values({
				productSkuId, locationId: storeId, type: 'ADJUSTMENT', quantity: before < 0 || onHand < 0 ? 0 : Math.abs(onHand - before),
				beforeQuantity: before, afterQuantity: onHand, referenceType: 'manual_adjustment', referenceId: inventoryId,
				note: before < 0 || onHand < 0 ? `庫存模式變更：${before < 0 ? '不限量' : before} → ${onHand < 0 ? '不限量' : onHand}` : `商品目錄直接設定庫存 ${before} → ${onHand}`,
				createdBy: input.createdBy,
			});
		}
	});
}

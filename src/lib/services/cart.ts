import { fetchSanityProductById } from '../sanity/products';
import { findContentVariant, specificationImage } from '../sanity/specification-media';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { availableStock } from '../db/inventory';
import {
	cartItems,
	carts,
	inventory,
	productSkus,
	productPriceTiers,
	products,
} from '../db/schema';
import { unitPriceForQuantity, type QuantityPriceTier } from './quantity-pricing';

export type CartLine = {
	cartItemId: string;
	productSkuId: string;
	productId: string;
	productName: string;
	sku: string;
	skuName: string;
	unitPrice: number;
	baseUnitPrice: number;
	quantity: number;
	minimumPurchaseQuantity: number;
	priceTiers: QuantityPriceTier[];
	lineTotal: number;
	available: number;
	slug: string;
	imageUrl: string | null;
};

export type CartView = {
	cartId: string;
	items: CartLine[];
	itemCount: number;
	subtotal: number;
};

async function getActiveCartRow(userId: string) {
	const db = getDb();
	const [row] = await db
		.select()
		.from(carts)
		.where(and(eq(carts.userId, userId), eq(carts.status, 'ACTIVE')))
		.limit(1);
	return row ?? null;
}

export async function ensureActiveCart(userId: string) {
	const existing = await getActiveCartRow(userId);
	if (existing) return existing;

	const db = getDb();
	const [created] = await db
		.insert(carts)
		.values({
			userId,
			status: 'ACTIVE',
		})
		.returning();

	if (!created) {
		throw new Error('無法建立購物車');
	}
	return created;
}

async function stockForSku(productSkuId: string): Promise<number> {
	const db = getDb();
	const [sku] = await db.select({ enabled: sql<boolean>`${productSkus.isActive} AND ${productSkus.saleEnabled} AND ${products.isActive} AND ${products.isOnline}` }).from(productSkus).innerJoin(products, eq(productSkus.productId, products.id)).where(eq(productSkus.id, productSkuId)).limit(1);
	if (!sku?.enabled) return 0;
	const rows = await db
		.select({
			onHand: inventory.onHand,
			reserved: inventory.reserved,
		})
		.from(inventory)
		.where(eq(inventory.productSkuId, productSkuId));

	if (rows.length === 0 || rows.some((row) => row.onHand < 0)) return -1;
	return rows.reduce(
		(sum, row) => sum + availableStock(row.onHand, row.reserved),
		0,
	);
}

/**
 * Cart contents with prices recomputed from PostgreSQL (never trust browser).
 */
export async function getCartView(userId: string): Promise<CartView> {
	const cart = await ensureActiveCart(userId);
	const db = getDb();

	const rows = await db
		.select({
			cartItemId: cartItems.id,
			productSkuId: cartItems.productSkuId,
			quantity: cartItems.quantity,
			productId: products.id,
			productName: products.name,
			sanityProductId: products.sanityProductId,
			variantKey: productSkus.variantKey,
			sourceSku: productSkus.sourceSku,
			slug: products.slug,
			sku: productSkus.sku,
			skuName: productSkus.name,
			unitPrice: productSkus.sellingPrice,
			minimumPurchaseQuantity: products.minimumPurchaseQuantity,
			skuActive: sql<boolean>`${productSkus.isActive} AND ${productSkus.saleEnabled}`,
			productActive: products.isActive,
			productOnline: products.isOnline,
		})
		.from(cartItems)
		.innerJoin(productSkus, eq(cartItems.productSkuId, productSkus.id))
		.innerJoin(products, eq(productSkus.productId, products.id))
		.where(eq(cartItems.cartId, cart.id));
	const productIds = [...new Set(rows.map((row) => row.productId))];
	const tiers = productIds.length ? await db.select({
		productId: productPriceTiers.productId,
		minQuantity: productPriceTiers.minQuantity,
		maxQuantity: productPriceTiers.maxQuantity,
		unitPrice: productPriceTiers.unitPrice,
	}).from(productPriceTiers).where(inArray(productPriceTiers.productId, productIds)).orderBy(productPriceTiers.sortOrder) : [];
	const tiersByProduct = new Map<string, QuantityPriceTier[]>();
	for (const tier of tiers) tiersByProduct.set(tier.productId, [...(tiersByProduct.get(tier.productId) ?? []), tier]);
	const quantityByProduct = new Map<string, number>();
	for (const row of rows) quantityByProduct.set(row.productId, (quantityByProduct.get(row.productId) ?? 0) + row.quantity);

	const contentById = new Map(await Promise.all([...new Set(rows.map((row) => row.sanityProductId))].map(async (id) => {
		try { return [id, await fetchSanityProductById(id)] as const; }
		catch { console.error("[Cart] Product image unavailable", id); return [id, null] as const; }
	})));
	const items: CartLine[] = [];
	for (const row of rows) {
		const available = row.skuActive && row.productActive && row.productOnline ? await stockForSku(row.productSkuId) : 0;
		const productTiers = tiersByProduct.get(row.productId) ?? [];
		const unitPrice = unitPriceForQuantity(row.unitPrice, quantityByProduct.get(row.productId) ?? row.quantity, productTiers);
		const content = contentById.get(row.sanityProductId);
		const variant = content ? findContentVariant(content, row) : undefined;
		items.push({
			cartItemId: row.cartItemId,
			productSkuId: row.productSkuId,
			productId: row.productId,
			productName: row.productName,
			sku: row.sku,
			skuName: row.skuName,
			unitPrice,
			baseUnitPrice: row.unitPrice,
			quantity: row.quantity,
			minimumPurchaseQuantity: row.minimumPurchaseQuantity,
			priceTiers: productTiers,
			lineTotal: unitPrice * row.quantity,
			available,
			slug: row.slug,
			imageUrl: content ? specificationImage(content, variant?.optionIds ?? []) : null,
		});
	}

	const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
	const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);

	return {
		cartId: cart.id,
		items,
		itemCount,
		subtotal,
	};
}

export async function getCartItemCount(userId: string): Promise<number> {
	const cart = await getActiveCartRow(userId);
	if (!cart) return 0;

	const db = getDb();
	const [row] = await db
		.select({
			count: sql<number>`coalesce(sum(${cartItems.quantity}), 0)`,
		})
		.from(cartItems)
		.where(eq(cartItems.cartId, cart.id));

	return Number(row?.count ?? 0);
}

export async function addToCart(
	userId: string,
	productSkuId: string,
	quantity: number,
): Promise<CartView> {
	if (!Number.isInteger(quantity) || quantity < 1) {
		throw new Error('數量必須為正整數');
	}

	const db = getDb();
	const [sku] = await db
		.select({
			id: productSkus.id,
			isActive: sql<boolean>`${productSkus.isActive} AND ${productSkus.saleEnabled}`,
			unitPrice: productSkus.sellingPrice,
			productActive: products.isActive,
			productOnline: products.isOnline,
		})
		.from(productSkus)
		.innerJoin(products, eq(productSkus.productId, products.id))
		.where(eq(productSkus.id, productSkuId))
		.limit(1);

	if (!sku || !sku.isActive || !sku.productActive || !sku.productOnline) {
		throw new Error('商品無法加入購物車');
	}
	if (sku.unitPrice <= 0) throw new Error('此規格尚未設定售價，暫時無法加入購物車');

	const available = await stockForSku(productSkuId);
	const cart = await ensureActiveCart(userId);

	const [existing] = await db
		.select()
		.from(cartItems)
		.where(
			and(
				eq(cartItems.cartId, cart.id),
				eq(cartItems.productSkuId, productSkuId),
			),
		)
		.limit(1);

	const nextQty = (existing?.quantity ?? 0) + quantity;
	if (available >= 0 && nextQty > available) {
		throw new Error(
			available <= 0
				? '目前無庫存，無法加入購物車'
				: `庫存不足（可售 ${available}）`,
		);
	}

	if (existing) {
		await db
			.update(cartItems)
			.set({ quantity: nextQty })
			.where(eq(cartItems.id, existing.id));
	} else {
		await db.insert(cartItems).values({
			cartId: cart.id,
			productSkuId,
			quantity,
		});
	}

	await db
		.update(carts)
		.set({ updatedAt: new Date() })
		.where(eq(carts.id, cart.id));

	return getCartView(userId);
}

export async function updateCartItemQuantity(
	userId: string,
	cartItemId: string,
	quantity: number,
): Promise<CartView> {
	if (!Number.isInteger(quantity) || quantity < 1) {
		throw new Error('數量必須為正整數');
	}

	const cart = await ensureActiveCart(userId);
	const db = getDb();

	const [item] = await db
		.select()
		.from(cartItems)
		.where(
			and(eq(cartItems.id, cartItemId), eq(cartItems.cartId, cart.id)),
		)
		.limit(1);

	if (!item) {
		throw new Error('找不到購物車項目');
	}

	const available = await stockForSku(item.productSkuId);
	if (available >= 0 && quantity > available) {
		throw new Error(`庫存不足（可售 ${available}）`);
	}

	await db
		.update(cartItems)
		.set({ quantity })
		.where(eq(cartItems.id, item.id));

	await db
		.update(carts)
		.set({ updatedAt: new Date() })
		.where(eq(carts.id, cart.id));

	return getCartView(userId);
}

export async function removeCartItem(
	userId: string,
	cartItemId: string,
): Promise<CartView> {
	const cart = await ensureActiveCart(userId);
	const db = getDb();

	const deleted = await db
		.delete(cartItems)
		.where(
			and(eq(cartItems.id, cartItemId), eq(cartItems.cartId, cart.id)),
		)
		.returning({ id: cartItems.id });

	if (deleted.length === 0) {
		throw new Error('找不到購物車項目');
	}

	await db
		.update(carts)
		.set({ updatedAt: new Date() })
		.where(eq(carts.id, cart.id));

	return getCartView(userId);
}

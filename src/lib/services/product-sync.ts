import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { productSkus, products } from '../db/schema';
import { findDefaultProductSku, isSpecificationSku } from './product-sku-identity';
import {
	fetchSanityProducts,
	fetchSanityProductById,
	shouldRequireManualConfirmation,
	type ProductContent,
} from '../sanity';

export type ProductSyncResult = {
	fetched: number;
	created: number;
	updated: number;
	skuCreated: number;
	skipped: number;
	errors: Array<{ sanityProductId: string; message: string }>;
};

function syncFieldChanges<T extends object>(expected: T, current: object): Partial<T> {
  return Object.fromEntries(Object.entries(expected).filter(([key, value]) => value !== (current as Record<string, unknown>)[key])) as Partial<T>;
}

function defaultSkuCode(slug: string, sanityProductId: string): string {
	const safe = slug.replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase() || 'ITEM';
	const shortId = sanityProductId.replace(/^drafts\./, '').slice(-6).toUpperCase();
	return `SKU-${safe}-${shortId}`;
}

function variantSkuName(optionNames: string[]): string {
	return optionNames.join(' / ');
}

/**
 * Sync Sanity product content → PostgreSQL `products` + default `product_skus`.
 *
 * Rules:
 * - `products.sanity_product_id` = Sanity `_id`
 * - Content fields (name, slug, type, enabled) update from Sanity
 * - Price stays PostgreSQL source of truth (never overwritten on update)
 * - Always ensure at least one SKU row exists
 * - Does not modify Sanity schema or write back to Sanity
 */
export async function syncProductsFromSanity(sanityProductId?: string): Promise<ProductSyncResult> {
	const db = getDb();
	let items: ProductContent[];
	if (sanityProductId) {
		const item = await fetchSanityProductById(sanityProductId, { fresh: true });
		if (!item) throw new Error('找不到要同步的商品');
		items = [item];
	} else {
		items = await fetchSanityProducts();
	}

	const result: ProductSyncResult = {
		fetched: items.length,
		created: 0,
		updated: 0,
		skuCreated: 0,
		skipped: 0,
		errors: [],
	};

	for (const item of items) {
		try {
			await syncOneProduct(db, item, result);
		} catch (error) {
			result.errors.push({
				sanityProductId: item.sanityProductId,
				message: error instanceof Error ? error.message : 'Unknown sync error',
			});
		}
	}

	return result;
}

async function syncOneProduct(
	db: ReturnType<typeof getDb>,
	item: ProductContent,
	result: ProductSyncResult,
): Promise<void> {
	if (!item.name || !item.slug) {
		result.skipped += 1;
		result.errors.push({
			sanityProductId: item.sanityProductId,
			message: 'Missing name or slug',
		});
		return;
	}

	const [existing] = await db
		.select()
		.from(products)
		.where(eq(products.sanityProductId, item.sanityProductId))
		.limit(1);

	const now = new Date();

	if (!existing) {
		const [created] = await db
			.insert(products)
			.values({
				sanityProductId: item.sanityProductId,
				name: item.name,
				slug: item.slug,
				productType: item.productType,
				sellingPrice: 0,
				unit: 'pcs',
				isActive: item.isEnabled,
				isOnline: item.isEnabled,
				requiresManualConfirmation: shouldRequireManualConfirmation(
					item.categorySlug,
					item.categoryLabel,
				),
				updatedAt: now,
			})
			.returning();

		if (!created) {
			throw new Error('Insert products returned no row');
		}

		result.created += 1;

		if (item.variants.length) {
			await db.insert(productSkus).values(item.variants.map((variant) => ({
				productId: created.id,
				sku: variant.sku,
				variantKey: variant.variantKey,
				sourceSku: variant.sku,
				name: variantSkuName(variant.optionNames),
				unit: 'pcs',
				sellingPrice: 0,
				isActive: item.isEnabled,
				updatedAt: now,
			})));
			result.skuCreated += item.variants.length;
		} else {
			await db.insert(productSkus).values({
				productId: created.id,
				sku: defaultSkuCode(item.slug, item.sanityProductId),
				name: item.name,
				unit: 'pcs',
				sellingPrice: 0,
				isActive: item.isEnabled,
				updatedAt: now,
			});
			result.skuCreated += 1;
		}
		return;
	}

	const productPatch = syncFieldChanges({ name: item.name, slug: item.slug, productType: item.productType, isActive: item.isEnabled, isOnline: item.isEnabled }, existing);
	if (Object.keys(productPatch).length) {
		await db.update(products).set({ ...productPatch, updatedAt: now }).where(eq(products.id, existing.id));
		result.updated += 1;
	}

	if (item.variants.length) {
		const currentSkus = await db
			.select()
			.from(productSkus)
			.where(eq(productSkus.productId, existing.id));
		const claimedIds = new Set<string>();
		for (const variant of item.variants) {
			const sku = currentSkus.find((candidate) => candidate.variantKey === variant.variantKey)
				?? currentSkus.find((candidate) => candidate.sourceSku === variant.sku)
				?? currentSkus.find((candidate) => candidate.sku === variant.sku);
			if (sku) {
				claimedIds.add(sku.id);
				const patch = syncFieldChanges({ variantKey: variant.variantKey, sourceSku: variant.sku, name: variantSkuName(variant.optionNames), isActive: item.isEnabled }, sku);
				if (Object.keys(patch).length) await db.update(productSkus).set({ ...patch, updatedAt: now }).where(eq(productSkus.id, sku.id));
			} else {
				const [createdSku] = await db.insert(productSkus).values({
					productId: existing.id,
					sku: variant.sku,
					variantKey: variant.variantKey,
					sourceSku: variant.sku,
					name: variantSkuName(variant.optionNames),
					unit: 'pcs',
					sellingPrice: 0,
					isActive: item.isEnabled,
					updatedAt: now,
				}).returning({ id: productSkus.id });
				if (createdSku) claimedIds.add(createdSku.id);
				result.skuCreated += 1;
			}
		}
		for (const oldSku of currentSkus) {
			if (!claimedIds.has(oldSku.id) && oldSku.isActive) {
				await db.update(productSkus).set({ isActive: false, updatedAt: now }).where(eq(productSkus.id, oldSku.id));
			}
		}
		return;
	}

	const configuredSkus = await db
		.select()
		.from(productSkus)
		.where(eq(productSkus.productId, existing.id));
	const oldVariantSkus = configuredSkus.filter(isSpecificationSku);
	if (oldVariantSkus.length) {
		await db.transaction(async (tx) => {
			const lockedSkus = await tx.select().from(productSkus).where(eq(productSkus.productId, existing.id)).for('update');
			const code = defaultSkuCode(item.slug, item.sanityProductId);
			const fallback = findDefaultProductSku(lockedSkus, code);
			if (fallback) {
				const patch = syncFieldChanges({ name: item.name, isActive: item.isEnabled }, fallback);
				if (Object.keys(patch).length) await tx.update(productSkus).set({ ...patch, updatedAt: now }).where(eq(productSkus.id, fallback.id));
			}
			else {
				await tx.insert(productSkus).values({ productId: existing.id, sku: code, sourceSku: code, name: item.name, unit: 'pcs', sellingPrice: existing.sellingPrice, isActive: item.isEnabled, updatedAt: now });
				result.skuCreated += 1;
			}
			for (const oldSku of lockedSkus.filter(isSpecificationSku)) {
				if (oldSku.isActive) {
					await tx.update(productSkus).set({ isActive: false, updatedAt: now }).where(eq(productSkus.id, oldSku.id));
				}
			}
		});
		return;
	}

	const [sku] = await db
		.select()
		.from(productSkus)
		.where(eq(productSkus.productId, existing.id))
		.limit(1);

	if (!sku) {
		await db.insert(productSkus).values({
			productId: existing.id,
			sku: defaultSkuCode(item.slug, item.sanityProductId),
			name: item.name,
			unit: 'pcs',
			sellingPrice: existing.sellingPrice,
			isActive: item.isEnabled,
			updatedAt: now,
		});
		result.skuCreated += 1;
	} else {
		const patch = syncFieldChanges({ name: item.name, isActive: item.isEnabled }, sku);
		if (Object.keys(patch).length) await db.update(productSkus).set({ ...patch, updatedAt: now }).where(eq(productSkus.id, sku.id));
	}
}

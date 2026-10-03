import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { productSkus, products } from '../db/schema';
import {
	fetchSanityProducts,
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

function defaultSkuCode(slug: string, sanityProductId: string): string {
	const safe = slug.replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase() || 'ITEM';
	const shortId = sanityProductId.replace(/^drafts\./, '').slice(-6).toUpperCase();
	return `SKU-${safe}-${shortId}`;
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
export async function syncProductsFromSanity(): Promise<ProductSyncResult> {
	const db = getDb();
	const items = await fetchSanityProducts();

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
		return;
	}

	await db
		.update(products)
		.set({
			name: item.name,
			slug: item.slug,
			productType: item.productType,
			isActive: item.isEnabled,
			isOnline: item.isEnabled,
			// Do NOT overwrite sellingPrice / requiresManualConfirmation
			updatedAt: now,
		})
		.where(eq(products.id, existing.id));

	result.updated += 1;

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
		await db
			.update(productSkus)
			.set({
				name: item.name,
				isActive: item.isEnabled,
				// Keep sku code + sellingPrice as PG source of truth
				updatedAt: now,
			})
			.where(eq(productSkus.id, sku.id));
	}
}

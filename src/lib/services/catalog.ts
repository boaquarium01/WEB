import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/client';
import { availableStock } from '../db/inventory';
import { inventory, productSkus, products } from '../db/schema';
import {
	fetchSanityCategories,
	fetchSanityProductBySlug,
	fetchSanityProducts,
	type ProductContent,
} from '../sanity';

export type CatalogSku = {
	id: string;
	sku: string;
	name: string;
	sellingPrice: number;
	available: number;
	isActive: boolean;
};

export type CatalogProductListItem = {
	productId: string;
	sanityProductId: string;
	productType: string;
	slug: string;
	name: string;
	excerpt: string | null;
	imageUrl: string | null;
	categoryLabel: string | null;
	categorySlug: string | null;
	searchText?: string;
	sellingPrice: number;
	available: number;
	inStock: boolean;
	defaultSkuId: string | null;
};

export type CatalogProductDetail = CatalogProductListItem & {
	body: unknown[] | null;
	galleryUrls: string[];
	skus: CatalogSku[];
	requiresManualConfirmation: boolean;
	seoTitle: string | null;
	seoDescription: string | null;
};

type PgProductRow = {
	productId: string;
	sanityProductId: string;
	slug: string;
	name: string;
	sellingPrice: number;
	requiresManualConfirmation: boolean;
	skuId: string | null;
	skuCode: string | null;
	skuName: string | null;
	skuPrice: number | null;
	skuActive: boolean | null;
	onHand: number | null;
	reserved: number | null;
};

async function loadOnlinePgRows(
	sanityIds?: string[],
): Promise<Map<string, PgProductRow[]>> {
	const db = getDb();

	const conditions = [eq(products.isActive, true), eq(products.isOnline, true)];
	if (sanityIds && sanityIds.length > 0) {
		conditions.push(inArray(products.sanityProductId, sanityIds));
	}

	const rows = await db
		.select({
			productId: products.id,
			sanityProductId: products.sanityProductId,
			productType: products.productType,
			slug: products.slug,
			name: products.name,
			sellingPrice: products.sellingPrice,
			requiresManualConfirmation: products.requiresManualConfirmation,
			skuId: productSkus.id,
			skuCode: productSkus.sku,
			skuName: productSkus.name,
			skuPrice: productSkus.sellingPrice,
			skuActive: productSkus.isActive,
			onHand: inventory.onHand,
			reserved: inventory.reserved,
		})
		.from(products)
		.leftJoin(
			productSkus,
			and(eq(productSkus.productId, products.id), eq(productSkus.isActive, true)),
		)
		.leftJoin(inventory, eq(inventory.productSkuId, productSkus.id))
		.where(and(...conditions));

	const map = new Map<string, PgProductRow[]>();
	for (const row of rows) {
		const list = map.get(row.sanityProductId) ?? [];
		list.push(row);
		map.set(row.sanityProductId, list);
	}
	return map;
}

function buildSkus(rows: PgProductRow[]): CatalogSku[] {
	const bySku = new Map<string, CatalogSku>();

	for (const row of rows) {
		if (!row.skuId || !row.skuCode) continue;
		const available = availableStock(row.onHand ?? -1, row.reserved ?? 0);
		const existing = bySku.get(row.skuId);
		if (existing) {
				existing.available = existing.available < 0 || available < 0
				? -1
				: existing.available + available;
			continue;
		}
		bySku.set(row.skuId, {
			id: row.skuId,
			sku: row.skuCode,
			name: row.skuName ?? row.name,
			sellingPrice: row.skuPrice ?? row.sellingPrice,
			available,
			isActive: row.skuActive !== false,
		});
	}

	return [...bySku.values()];
}

function totalAvailability(skus: CatalogSku[]): number {
	return skus.reduce(
		(total, sku) => (total < 0 || sku.available < 0 ? -1 : total + sku.available),
		0,
	);
}

function portableTextToSearchText(value: unknown): string {
	if (typeof value === 'string' || typeof value === 'number') return String(value);
	if (Array.isArray(value)) return value.map(portableTextToSearchText).filter(Boolean).join(' ');
	if (!value || typeof value !== 'object') return '';
	return Object.entries(value)
		.filter(([key]) => !['_key', '_type', 'markDefs', 'style'].includes(key))
		.map(([, child]) => portableTextToSearchText(child))
		.filter(Boolean)
		.join(' ');
}

function mergeListItem(
	content: ProductContent,
	rows: PgProductRow[],
): CatalogProductListItem | null {
	if (rows.length === 0) return null;

	const skus = buildSkus(rows);
	const defaultSku = skus[0] ?? null;
	const first = rows[0]!;
	const sellingPrice = defaultSku?.sellingPrice ?? first.sellingPrice;
	const available = totalAvailability(skus);

	return {
		productId: first.productId,
		sanityProductId: content.sanityProductId,
		slug: content.slug,
		name: content.name,
		excerpt: content.excerpt,
		imageUrl: content.imageUrl,
		categoryLabel: content.categoryLabel,
		categorySlug: content.categorySlug,
		searchText: portableTextToSearchText(content.body),
		sellingPrice,
		available,
		inStock: available !== 0,
		defaultSkuId: defaultSku?.id ?? null,
	};
}

/**
 * Online catalog list: Sanity content + PostgreSQL price/stock.
 * Only products present in both systems and marked online/active.
 */
export async function listCatalogProducts(options?: {
	categorySlug?: string;
}): Promise<CatalogProductListItem[]> {
	let contents: ProductContent[];
	try {
		contents = await fetchSanityProducts();
	} catch (error) {
		console.error('[Catalog] Sanity unavailable; serving synced PostgreSQL products', error);
		return listCatalogProductsFromPg(options?.categorySlug);
	}
	const enabled = contents.filter((c) => c.isEnabled);
	const filtered = options?.categorySlug
		? enabled.filter((c) => c.categorySlug === options.categorySlug)
		: enabled;

	if (filtered.length === 0) return [];

	const pgMap = await loadOnlinePgRows(filtered.map((c) => c.sanityProductId));

	const items: CatalogProductListItem[] = [];
	for (const content of filtered) {
		const rows = pgMap.get(content.sanityProductId) ?? [];
		const item = mergeListItem(content, rows);
		if (item) items.push(item);
	}

	return items;
}

/** Keep the shop browseable when Sanity is temporarily unreachable. */
async function listCatalogProductsFromPg(
	categorySlug?: string,
): Promise<CatalogProductListItem[]> {
	const pgMap = await loadOnlinePgRows();
	return [...pgMap.values()]
		.filter((rows) => rows.length > 0)
		.filter((rows) => !categorySlug || rows[0]!.productType === categorySlug)
		.map((rows) => {
			const first = rows[0]!;
			const skus = buildSkus(rows);
			const available = totalAvailability(skus);
			return {
				productId: first.productId,
				sanityProductId: first.sanityProductId,
				slug: first.slug,
				name: first.name,
				excerpt: null,
				imageUrl: null,
				categoryLabel: null,
				categorySlug: first.productType,
				sellingPrice: skus[0]?.sellingPrice ?? first.sellingPrice,
				available,
				inStock: available !== 0,
				defaultSkuId: skus[0]?.id ?? null,
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
}

export async function getCatalogProductBySlug(
	slug: string,
): Promise<CatalogProductDetail | null> {
	let content: ProductContent | null;
	try {
		content = await fetchSanityProductBySlug(slug);
	} catch (error) {
		console.error('[Catalog] Sanity unavailable; serving synced PostgreSQL product', error);
		const rows = (await loadOnlinePgRows()).values();
		const matching = [...rows].find((items) => items[0]?.slug === slug);
		if (!matching?.length) return null;
		const first = matching[0]!;
		const skus = buildSkus(matching);
		const base: CatalogProductListItem = {
			productId: first.productId,
			sanityProductId: first.sanityProductId,
			slug: first.slug,
			name: first.name,
			excerpt: null,
			imageUrl: null,
			categoryLabel: null,
			categorySlug: first.productType,
			sellingPrice: skus[0]?.sellingPrice ?? first.sellingPrice,
			available: totalAvailability(skus),
			inStock: skus.some((sku) => sku.available !== 0),
			defaultSkuId: skus[0]?.id ?? null,
		};
		return {
			...base,
			body: null,
			galleryUrls: [],
			skus,
			requiresManualConfirmation: first.requiresManualConfirmation,
			seoTitle: null,
			seoDescription: null,
		};
	}
	if (!content || !content.isEnabled) return null;

	const pgMap = await loadOnlinePgRows([content.sanityProductId]);
	const rows = pgMap.get(content.sanityProductId) ?? [];
	const base = mergeListItem(content, rows);
	if (!base) return null;

	const skus = buildSkus(rows);
	const first = rows[0]!;

	return {
		...base,
		body: content.body,
		galleryUrls: content.galleryUrls,
		skus,
		requiresManualConfirmation: first.requiresManualConfirmation,
		seoTitle: content.seoTitle,
		seoDescription: content.seoDescription,
	};
}

export async function listCatalogCategories(): Promise<
	Array<{ slug: string; label: string }>
> {
	try {
		const cats = await fetchSanityCategories();
		return cats
			.filter((c) => Boolean(c.slug))
			.map((c) => ({ slug: c.slug as string, label: c.name }));
	} catch (error) {
		console.error('[Catalog] Sanity categories unavailable', error);
		const pgMap = await loadOnlinePgRows();
		const categories = new Map<string, string>();
		for (const rows of pgMap.values()) {
			const productType = rows[0]?.productType;
			if (productType && productType !== 'uncategorized') {
				categories.set(productType, productType);
			}
		}
		return [...categories].map(([slug, label]) => ({ slug, label }));
	}
}

/** Format TWD price for display (server decides amount). */
export function formatTwd(amount: number): string {
	return `NT$ ${amount.toLocaleString('zh-TW')}`;
}

import { eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/client';
import { products, productSkus } from '../db/schema';
import { fetchSanityProductById } from '../sanity/products';
import { findContentVariant, specificationImage } from '../sanity/specification-media';

/**
 * 訂單商品小圖（前台「我的訂單」與後台訂單共用）：
 * 與購物車相同，優先用所選規格的圖片；Sanity 讀不到就回傳 null，畫面改顯示魚的圖示。
 */
export async function attachOrderItemImages<T extends { productSkuId: string; sku: string }>(
	items: T[],
): Promise<(T & { imageUrl: string | null })[]> {
	const skuIds = [...new Set(items.map((item) => item.productSkuId))];
	if (!skuIds.length) return items.map((item) => ({ ...item, imageUrl: null }));

	const skuRows = await getDb()
		.select({
			id: productSkus.id,
			variantKey: productSkus.variantKey,
			sourceSku: productSkus.sourceSku,
			sanityProductId: products.sanityProductId,
		})
		.from(productSkus)
		.innerJoin(products, eq(products.id, productSkus.productId))
		.where(inArray(productSkus.id, skuIds));
	const skuById = new Map(skuRows.map((row) => [row.id, row]));

	const sanityIds = [...new Set(skuRows.map((row) => row.sanityProductId))];
	const contentById = new Map(await Promise.all(sanityIds.map(async (id) => {
		try { return [id, await fetchSanityProductById(id)] as const; }
		catch { return [id, null] as const; }
	})));

	return items.map((item) => {
		const sku = skuById.get(item.productSkuId);
		const content = sku ? contentById.get(sku.sanityProductId) : null;
		const variant = content && sku ? findContentVariant(content, { variantKey: sku.variantKey, sourceSku: sku.sourceSku, sku: item.sku }) : undefined;
		return { ...item, imageUrl: content ? specificationImage(content, variant?.optionIds ?? []) : null };
	});
}

/** 商品小圖只需約 56–72px，向 Sanity 要 144px 的正方形縮圖，不下載原圖 */
export function orderThumbUrl(url: string): string {
	if (!url.includes('cdn.sanity.io')) return url;
	const thumb = new URL(url);
	for (const [key, value] of Object.entries({ w: '144', h: '144', fit: 'crop', auto: 'format' })) thumb.searchParams.set(key, value);
	return thumb.toString();
}

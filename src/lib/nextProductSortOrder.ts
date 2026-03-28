import type { SanityClient } from '@sanity/client';

/**
 * 同分類內「排在最後」：比該分類現有商品最大 sortOrder 多 1（無商品則為 1）。
 */
export async function nextSortOrderForCategory(client: SanityClient, categoryDocumentId: string): Promise<number> {
  const max = await client.fetch<number | null>(
    `coalesce(*[_type == "product" && category._ref == $catId] | order(sortOrder desc)[0].sortOrder, 0)`,
    { catId: categoryDocumentId }
  );
  const m = typeof max === 'number' && Number.isFinite(max) ? max : 0;
  return m + 1;
}

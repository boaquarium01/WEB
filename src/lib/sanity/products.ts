import { getSanityClient } from './client';
import { adaptSanityProduct } from './product-adapter';
import {
	ALL_CATEGORIES_QUERY,
	ALL_PRODUCTS_QUERY,
	PRODUCT_BY_ID_QUERY,
	PRODUCT_BY_SLUG_QUERY,
} from './queries';
import type { ProductContent, SanityProductDocument } from './types';

export async function fetchSanityProducts(): Promise<ProductContent[]> {
	const docs = await getSanityClient().fetch<SanityProductDocument[]>(
		ALL_PRODUCTS_QUERY,
	);
	return docs.map(adaptSanityProduct);
}

export async function fetchSanityProductBySlug(
	slug: string,
): Promise<ProductContent | null> {
	const doc = await getSanityClient().fetch<SanityProductDocument | null>(
		PRODUCT_BY_SLUG_QUERY,
		{ slug },
	);
	return doc ? adaptSanityProduct(doc) : null;
}

export async function fetchSanityProductById(
	id: string,
): Promise<ProductContent | null> {
	const doc = await getSanityClient().fetch<SanityProductDocument | null>(
		PRODUCT_BY_ID_QUERY,
		{ id },
	);
	return doc ? adaptSanityProduct(doc) : null;
}

export async function fetchSanityCategories(): Promise<
	Array<{ _id: string; name: string; slug: string | null }>
> {
	return getSanityClient().fetch(ALL_CATEGORIES_QUERY);
}

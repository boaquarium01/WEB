import type { Category, Product } from './catalog';
import { adaptSanityProduct } from '../lib/sanity/product-adapter';
import { getSanityClient } from '../lib/sanity/client';
import {
	ALL_CATEGORIES_QUERY,
	FEATURED_PRODUCTS_QUERY,
	HERO_SPOTLIGHT_PRODUCTS_QUERY,
} from '../lib/sanity/queries';
import type { SanityProductDocument } from '../lib/sanity/types';

export type { Category, Product };

function toV1Product(doc: SanityProductDocument): Product {
	const content = adaptSanityProduct(doc);
	return {
		slug: content.slug,
		name: content.name,
		excerpt: content.excerpt ?? '',
		categoryLabel: content.categoryLabel ?? undefined,
		image: content.imageUrl ?? '',
		enabled: content.isEnabled,
		featured: content.featured,
		heroSpotlight: content.heroSpotlight,
	};
}

export async function getAllCategories(): Promise<Category[]> {
	try {
		const cats = await getSanityClient().fetch<
			Array<{ _id: string; name: string; slug: string | null }>
		>(ALL_CATEGORIES_QUERY);
		return (cats ?? [])
			.filter((c) => Boolean(c.slug))
			.map((c, i) => ({
				id: c.slug as string,
				label: c.name,
				sortOrder: i,
			}));
	} catch (err) {
		console.warn('[Sanity] categories failed', err);
		return [];
	}
}

export async function getFeaturedProducts(limit = 10): Promise<Product[]> {
	const cap = Math.max(0, Math.floor(Number(limit)) || 0);
	if (cap === 0) return [];
	try {
		const docs = await getSanityClient().fetch<SanityProductDocument[]>(
			FEATURED_PRODUCTS_QUERY,
		);
		return (docs ?? [])
			.map(toV1Product)
			.filter((p) => p.slug && p.enabled)
			.slice(0, cap);
	} catch (err) {
		console.warn('[Sanity] featured failed', err);
		return [];
	}
}

export async function getHeroSpotlightProducts(): Promise<Product[]> {
	try {
		const docs = await getSanityClient().fetch<SanityProductDocument[]>(
			HERO_SPOTLIGHT_PRODUCTS_QUERY,
		);
		return (docs ?? [])
			.map(toV1Product)
			.filter((p) => p.slug && p.enabled);
	} catch (err) {
		console.warn('[Sanity] hero spotlight failed', err);
		return [];
	}
}

import { urlForImage } from './client';
import type { ProductContent, SanityImageAsset, SanityProductDocument } from './types';

const LIVE_CATEGORY_HINTS = [
	'fish',
	'shrimp',
	'crab',
	'plant',
	'coral',
	'live',
	'魚',
	'蝦',
	'蟹',
	'水草',
	'活體',
];

function imageToUrl(source: SanityImageAsset | null | undefined): string | null {
	if (!source?.asset?._ref) return null;
	try {
		return urlForImage(source).width(1200).auto('format').url();
	} catch {
		return null;
	}
}

/**
 * Heuristic for `requires_manual_confirmation` on first sync only.
 * Does not change Sanity schema; can be overridden later in admin.
 */
export function shouldRequireManualConfirmation(
	categorySlug: string | null,
	categoryLabel: string | null,
): boolean {
	const haystack = `${categorySlug ?? ''} ${categoryLabel ?? ''}`.toLowerCase();
	return LIVE_CATEGORY_HINTS.some((hint) => haystack.includes(hint.toLowerCase()));
}

/**
 * Maps a Sanity `product` document → V2 content DTO.
 * Does not write to PostgreSQL and does not invent Sanity fields.
 */
export function adaptSanityProduct(doc: SanityProductDocument): ProductContent {
	const slug = doc.slug?.trim() || doc._id;
	const categorySlug = doc.category?.slug?.trim() || null;
	const categoryLabel = doc.category?.name?.trim() || null;
	const primaryImage = imageToUrl(doc.image);
	const galleryUrls = (doc.gallery ?? [])
		.map((img) => imageToUrl(img))
		.filter((url): url is string => Boolean(url));

	const uniqueGallery = [...new Set(galleryUrls)].filter(
		(url) => url !== primaryImage,
	);

	return {
		sanityProductId: doc._id,
		name: doc.name.trim(),
		slug,
		categoryId: doc.category?._id ?? null,
		categorySlug,
		categoryLabel,
		productType: categorySlug ?? 'uncategorized',
		excerpt: doc.excerpt?.trim() || null,
		body: doc.body,
		isEnabled: doc.enabled !== false,
		sortOrder: doc.sortOrder ?? 0,
		featured: Boolean(doc.featured),
		heroSpotlight: Boolean(doc.heroSpotlight),
		imageUrl: primaryImage,
		galleryUrls: uniqueGallery,
		seoTitle: doc.seoTitle?.trim() || null,
		seoKeywords: doc.seoKeywords ?? [],
		seoDescription: doc.seoDescription?.trim() || null,
	};
}

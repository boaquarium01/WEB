import { mergeSpecificationGallery } from './specification-media';
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

function stableHash(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
	return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
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
	const galleryUrls = mergeSpecificationGallery(doc.gallery ?? [], doc.specificationsEnabled ? doc.specifications ?? [] : [])
		.map((img) => imageToUrl(img))
		.filter((url): url is string => Boolean(url));

	const uniqueGallery = [...new Set(galleryUrls)].filter(
		(url) => url !== primaryImage,
	);
	const specifications = (doc.specifications ?? []).slice(0, 2).map((specification, specIndex) => ({
		id: specification._key?.trim() || `spec_${specIndex + 1}`,
		name: specification.name?.trim() ?? '',
		order: specIndex,
		options: (specification.options ?? []).slice(0, 10).map((option, optionIndex) => ({
			id: option._key?.trim() || `option_${specIndex + 1}_${optionIndex + 1}`,
			name: option.name?.trim() ?? '',
			order: optionIndex,
			imageUrl: specIndex === 0 ? imageToUrl(option.image) : null,
		})),
	})).filter((specification) => specification.name && specification.options.length && specification.options.every((option) => option.name));
	const legacy = !specifications.length && doc.option1Name?.trim()
		? (doc.variants ?? []).map((variant) => ({ option1Value: variant.option1Value?.trim() ?? '', option2Value: variant.option2Value?.trim() ?? '' })).filter((variant) => variant.option1Value)
		: [];
	const normalizedSpecifications = specifications.length ? specifications : legacy.length ? [
		{ id: 'legacy_spec_1', name: doc.option1Name!.trim(), order: 0, options: [...new Set(legacy.map((v) => v.option1Value))].map((name, i) => ({ id: `legacy_1_${i}_${name}`, name, order: i, imageUrl: null })) },
		...(doc.option2Name?.trim() && legacy.some((v) => v.option2Value) ? [{ id: 'legacy_spec_2', name: doc.option2Name.trim(), order: 1, options: [...new Set(legacy.map((v) => v.option2Value).filter(Boolean))].map((name, i) => ({ id: `legacy_2_${i}_${name}`, name, order: i, imageUrl: null })) }] : []),
	] : [];
	const optionNameById = new Map(normalizedSpecifications.flatMap((spec) => spec.options.map((option) => [option.id, option.name] as const)));
	const rawVariants = (doc.variants ?? []).map((variant) => {
			const key = variant._key?.trim();
			const optionIds = variant.optionIds?.filter((id) => optionNameById.has(id)) ?? (legacy.length ? [
				normalizedSpecifications[0]?.options.find((option) => option.name === variant.option1Value)?.id,
				...(normalizedSpecifications[1] ? [normalizedSpecifications[1].options.find((option) => option.name === variant.option2Value)?.id] : []),
			].filter((id): id is string => Boolean(id)) : []);
			if (!key || !optionIds.length) return null;
			const safeKey = variant.optionIds?.length && !variant.option1Value
				? stableHash(key)
				: key.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(-12) || 'VARIANT';
			const shortId = doc._id.replace(/^drafts\./, '').slice(-8).toUpperCase();
			return {
				sku: `VAR-${shortId}-${safeKey}`,
				variantKey: key,
				optionIds,
				optionNames: optionIds.map((id) => optionNameById.get(id) ?? ''),
			};
		})
		.filter((variant): variant is NonNullable<typeof variant> => Boolean(variant));
	const variants = rawVariants.filter((variant, index, all) => all.findIndex((candidate) => candidate.sku === variant.sku) === index);
	const specificationsEnabled = doc.specificationsEnabled ?? Boolean(doc.option1Name?.trim());

	return {
		sanityProductId: doc._id,
		createdAt: doc._createdAt,
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
		specificationsEnabled,
		specifications: specificationsEnabled ? normalizedSpecifications : [],
		variants: specificationsEnabled ? variants : [],
		seoTitle: doc.seoTitle?.trim() || null,
		seoKeywords: doc.seoKeywords ?? [],
		seoDescription: doc.seoDescription?.trim() || null,
	};
}

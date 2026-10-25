import type { ProductContent, SanityImageAsset } from './types';

/** Preserve gallery order, crop metadata and stable keys; append missing option assets. */
export function mergeSpecificationGallery(gallery: SanityImageAsset[], specifications: Array<{ options?: Array<{ image?: SanityImageAsset | null }> }>): SanityImageAsset[] {
	const seen = new Set<string>();
	return [...gallery, ...specifications.slice(0, 1).flatMap((group) => group.options?.map((option) => option.image).filter((image): image is SanityImageAsset => Boolean(image?.asset?._ref)) ?? [])]
		.filter((image) => {
			const ref = image.asset?._ref;
			if (!ref || seen.has(ref)) return false;
			seen.add(ref);
			return true;
		}).map((image) => ({ ...image, _key: image._key || `spec_${image.asset!._ref}` }));
}

/** Match stable identity before editable merchant SKU codes. */
export function findContentVariant(content: Pick<ProductContent, 'variants'>, sku: { variantKey?: string | null; sourceSku?: string | null; sku: string }) {
	return content.variants.find((variant) => sku.variantKey && variant.variantKey === sku.variantKey)
		?? content.variants.find((variant) => variant.sku === (sku.sourceSku || sku.sku));
}

/** Only the first specification can supply the selected combination image. */
export function specificationImage(content: Pick<ProductContent, 'specifications' | 'imageUrl'>, optionIds: string[]): string | null {
	for (const group of content.specifications.slice(0, 1)) {
		const image = group.options.find((option) => optionIds.includes(option.id))?.imageUrl;
		if (image) return image;
	}
	return content.imageUrl;
}

export function defaultPurchasableSku<T extends { isActive: boolean; available: number; sellingPrice: number }>(skus: T[], minimum = 1): T | undefined {
	return skus.find((sku) => sku.isActive && sku.sellingPrice > 0 && (sku.available < 0 || sku.available >= minimum)) ?? skus[0];
}

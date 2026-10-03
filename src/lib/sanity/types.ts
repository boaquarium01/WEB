/**
 * Raw Sanity `product` document shape used by V2 queries.
 * Based on electrical-earth/sanity/schemaTypes/product.ts — do not invent fields
 * (no price; no structured water-care fields in current schema).
 */
export type SanityImageAsset = {
	_type?: string;
	_key?: string;
	asset?: { _ref?: string; _type?: string };
	alt?: string;
	caption?: string;
	hotspot?: unknown;
	crop?: unknown;
};

export type SanityCategoryRef = {
	_id: string;
	name: string;
	slug: string | null;
};

export type SanityProductDocument = {
	_id: string;
	_type: 'product';
	name: string;
	slug: string | null;
	category: SanityCategoryRef | null;
	excerpt: string | null;
	body: unknown[] | null;
	enabled: boolean | null;
	sortOrder: number | null;
	featured: boolean | null;
	featuredSortOrder: number | null;
	heroSpotlight: boolean | null;
	heroSpotlightActivatedAt: string | null;
	image: SanityImageAsset | null;
	gallery: SanityImageAsset[] | null;
	seoTitle: string | null;
	seoKeywords: string[] | null;
	seoDescription: string | null;
};

/**
 * Content DTO for storefront / admin display.
 * Transaction fields (price, stock) live in PostgreSQL, not here.
 */
export type ProductContent = {
	sanityProductId: string;
	name: string;
	slug: string;
	categoryId: string | null;
	categorySlug: string | null;
	categoryLabel: string | null;
	/** Mapped into products.product_type (category slug or fallback). */
	productType: string;
	excerpt: string | null;
	body: unknown[] | null;
	isEnabled: boolean;
	sortOrder: number;
	featured: boolean;
	heroSpotlight: boolean;
	imageUrl: string | null;
	galleryUrls: string[];
	seoTitle: string | null;
	seoKeywords: string[];
	seoDescription: string | null;
};

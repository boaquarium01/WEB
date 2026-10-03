export type Category = {
	id: string;
	label: string;
	sortOrder?: number;
};

/** Homepage / catalog card shape aligned with V1. */
export type Product = {
	slug: string;
	name: string;
	excerpt: string;
	categoryLabel?: string;
	image: string;
	enabled: boolean;
	featured?: boolean;
	heroSpotlight?: boolean;
};

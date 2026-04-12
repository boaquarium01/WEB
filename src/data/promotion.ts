import type { SanityImageSource } from '@sanity/image-url/lib/types/types';

/**
 * 促銷分頁（Sanity：asset ref；Strapi：已展開的絕對 URL）
 */
export type Promotion = {
  _id?: string;
  title: string;
  slug: string;
  content: string;
  promoImages: SanityImageSource[] | { url: string }[];
};

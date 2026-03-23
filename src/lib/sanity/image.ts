/**
 * 從 Sanity 圖片欄位組 CDN 網址（於頁面改接 GROQ 資料時使用）
 *
 * 範例：
 * import { urlForImage } from '../../lib/sanity/image';
 * const src = urlForImage(doc.image)?.width(800).url();
 */
import imageUrlBuilder from '@sanity/image-url';
import type { ImageUrlBuilder } from '@sanity/image-url/lib/types/builder';
import type { SanityImageSource } from '@sanity/image-url/lib/types/types';

export function urlForImage(source: SanityImageSource | undefined): ImageUrlBuilder | null {
  const projectId = import.meta.env.PUBLIC_SANITY_PROJECT_ID;
  const dataset = import.meta.env.PUBLIC_SANITY_DATASET ?? 'production';
  if (!source || !projectId) return null;
  return imageUrlBuilder({ projectId, dataset }).image(source);
}

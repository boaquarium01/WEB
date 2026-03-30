/**
 * Sanity Image Pipeline：URL 建構、srcset、LQIP（極小模糊預覽）
 */
import imageUrlBuilder from '@sanity/image-url';
import type { ImageUrlBuilder } from '@sanity/image-url/lib/types/builder';
import type { SanityImageSource } from '@sanity/image-url/lib/types/types';

/** 與 src/lib/sanity/fetchProducts.ts readSanityEnv 一致，避免列表有圖、詳情 SanityImage 卻缺 projectId 而空白 */
const DEFAULT_PROJECT_ID = 'iz7fvprm';
const DEFAULT_DATASET = 'production';

function readProject() {
  const projectId =
    import.meta.env.PUBLIC_SANITY_PROJECT_ID?.trim() ||
    (typeof process !== 'undefined' ? process.env.PUBLIC_SANITY_PROJECT_ID?.trim() : undefined) ||
    (typeof process !== 'undefined' ? process.env.SANITY_STUDIO_PROJECT_ID?.trim() : undefined) ||
    DEFAULT_PROJECT_ID;

  const dataset =
    import.meta.env.PUBLIC_SANITY_DATASET ||
    (typeof process !== 'undefined' ? process.env.PUBLIC_SANITY_DATASET : undefined) ||
    (typeof process !== 'undefined' ? process.env.SANITY_STUDIO_DATASET : undefined) ||
    DEFAULT_DATASET;

  return { projectId, dataset };
}

/** 單一建構器（與舊程式相容）；缺 asset 或格式錯誤時回傳 null */
export function urlForImage(source: SanityImageSource | undefined | null): ImageUrlBuilder | null {
  const { projectId, dataset } = readProject();
  if (!source || !projectId) return null;
  try {
    /** 忽略 Studio 裁切／熱點，網址對應完整原圖（版型再用 object-fit 控制顯示） */
    return imageUrlBuilder({ projectId, dataset }).image(source).ignoreImageParams();
  } catch {
    return null;
  }
}

/** 響應式寬度列表（與 srcset 搭配） */
export const SANITY_IMAGE_WIDTHS = [400, 600, 800, 1200, 1600] as const;

export function buildSrcSet(source: SanityImageSource, widths: readonly number[] = SANITY_IMAGE_WIDTHS): string {
  const parts: string[] = [];
  for (const w of widths) {
    const b = urlForImage(source);
    if (!b) break;
    try {
      const u = b.width(w).fit('max').auto('format').format('webp').quality(85).url();
      parts.push(`${u} ${w}w`);
    } catch {
      /* 略過無法解析的寬度 */
    }
  }
  return parts.join(', ');
}

/** LQIP：極小尺寸 + blur，供首屏前顯示 */
export function buildLqipUrl(source: SanityImageSource): string | null {
  const b = urlForImage(source);
  if (!b) return null;
  try {
    return b.width(24).fit('max').blur(22).format('webp').quality(25).url();
  } catch {
    return null;
  }
}

/** 單一預設 src（fallback） */
export function buildDefaultSrc(source: SanityImageSource, width = 800): string | null {
  const b = urlForImage(source);
  if (!b) return null;
  try {
    return b.width(width).fit('max').auto('format').format('webp').quality(85).url();
  } catch {
    return null;
  }
}

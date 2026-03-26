import { buildLegacyTheme, defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { schemaTypes } from './sanity/schemaTypes';
import { createElement } from 'react';

const FishIcon = () =>
  createElement(
    'svg',
    { viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': 'true' },
    createElement('path', {
      d: 'M2 12c2.2-3.6 6.1-6 10.5-6 2.6 0 5 .9 7 2.4l2.2-1.2c.5-.3 1.1.2.9.8l-.9 3.1c.4.9.6 1.8.6 2.1 0 .3-.2 1.2-.6 2.1l.9 3.1c.2.6-.4 1.1-.9.8l-2.2-1.2c-2 1.5-4.4 2.4-7 2.4C8.1 18 4.2 15.6 2 12Zm10.5 4c1.9 0 3.7-.6 5.2-1.7l.5-.4 1.4.8-.5-1.7.2-.5c.3-.6.4-1.1.4-1.3 0-.2-.1-.7-.4-1.3l-.2-.5.5-1.7-1.4.8-.5-.4C16.2 8.6 14.4 8 12.5 8 9.3 8 6.4 9.6 4.7 12c1.7 2.4 4.6 4 7.8 4Z'
    }),
    createElement('circle', { cx: 12.8, cy: 11.2, r: 1 })
  );

const structure = (S: any) => {
  const productList: any = S.documentTypeList('product')
    .title('商品清單');
    // 使用 preview.media 顯示縮圖；preview.media 來源是你 schema 內的 `preview.media: 'image'`
    //（你的 product.image 欄位就是「列表主圖／輪播第一張」）
    // 不強制 defaultLayout，交由 Sanity 使用預設列表樣式（避免顯示成“大圖 media”）

  return S.list()
    .id('aquarium-content')
    .title('水博館官網管理系統')
    .defaultLayout('detail')
    .items([
      S.listItem()
        .id('products')
        .title('商品管理')
        .child(productList),
      S.listItem()
        .id('categories')
        .title('分類')
        .child(S.documentTypeList('category').title('商品分類'))
    ]);
};

/**
 * `@sanity/astro` 會在嵌入式 `/admin`（瀏覽器端）載入 `sanity.config.ts`。
 * 因此不能在未防呆的情況下直接使用 `process.env`（瀏覽器沒有 `process`）。
 * 這裡同時支援兩種情境：
 * - 瀏覽器：優先用 `import.meta.env.*`
 * - Node / Sanity CLI：保留 `process.env.*`（用 `typeof process` 防呆）
 */
const env = (import.meta as unknown as { env?: Record<string, unknown> }).env ?? {};

const getEnv = (key: string): string | undefined => {
  const v = env?.[key];
  if (typeof v === 'string' && v.trim()) return v.trim();

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    const pv = process.env[key];
    if (typeof pv === 'string' && pv.trim()) return pv.trim();
  }

  return undefined;
};

const projectId = getEnv('SANITY_STUDIO_PROJECT_ID') || getEnv('PUBLIC_SANITY_PROJECT_ID') || 'iz7fvprm';
const dataset = getEnv('SANITY_STUDIO_DATASET') || getEnv('PUBLIC_SANITY_DATASET') || 'production';
const studioToken =
  getEnv('SANITY_STUDIO_TOKEN') || getEnv('SANITY_AUTH_TOKEN') || getEnv('SANITY_API_TOKEN') || undefined;

// 美化 Sanity Studio：用官網偏深色的字色/品牌色
const studioTheme = buildLegacyTheme({
  '--black': '#0b0b0b',
  '--white': '#ffffff',
  '--gray': '#6b7280',
  '--gray-base': '#6b7280',
  '--component-bg': '#ffffff',
  '--component-text-color': '#0b0b0b',

  '--brand-primary': '#0b0b0b',
  '--default-button-color': '#4b5563',
  '--default-button-primary-color': '#0b0b0b',
  '--default-button-success-color': '#10b981',
  '--default-button-warning-color': '#f59e0b',
  '--default-button-danger-color': '#ef4444',

  '--state-info-color': '#0b0b0b',
  '--state-success-color': '#10b981',
  '--state-warning-color': '#f59e0b',
  '--state-danger-color': '#ef4444',

  '--main-navigation-color': '#0b0b0b',
  '--main-navigation-color--inverted': '#ffffff',

  '--focus-color': '#0b0b0b'
});

export default defineConfig({
  name: 'default',
  title: '水博館官網管理系統',
  icon: FishIcon,
  projectId,
  dataset,
  auth: studioToken ? { token: studioToken } : undefined,
  plugins: [structureTool({ structure })],
  theme: studioTheme,
  schema: {
    types: schemaTypes
  }
});

import { orderableDocumentListDeskItem } from '@sanity/orderable-document-list';
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

const structure = (S: any, context: any) => {
  const allProducts: any = S.documentTypeList('product').title('全部商品');
  const promoWeeklyNew: any = S.listItem()
    .id('promo-weekly-new')
    .title('每週新進魚隻')
    .child(S.document().schemaType('promotion').documentId('promotion-weekly-new').title('每週新進魚隻'));

  const promoSpecialOffers: any = S.listItem()
    .id('promo-special-offers')
    .title('預定優惠')
    .child(S.document().schemaType('promotion').documentId('promotion-special-offers').title('預定優惠'));

  const promoEquipmentSale: any = S.listItem()
    .id('promo-equipment-sale')
    .title('器材促銷')
    .child(S.document().schemaType('promotion').documentId('promotion-equipment-sale').title('器材促銷'));
  // 使用 preview.media 顯示縮圖；preview.media 來源是你 schema 內的 `preview.media: 'image'`
  //（你的 product.image 欄位就是「列表主圖／輪播第一張」）

  /** 分類內順序：@sanity/orderable-document-list 不支援「同 type 多組篩選清單」的 orderRank，改為依分類列出商品並預設 sortOrder 排序，方便對照改「分類內排序」數字 */
  const productsByCategorySort: any = S.listItem()
    .id('products-by-category-sort')
    .title('依分類調整順序')
    .child(
      S.documentTypeList('category')
        .title('選擇分類')
        .child((categoryId: string) =>
          S.documentList()
            .id(`products-in-category-${categoryId}`)
            .title('此分類商品（列表順序＝前台順序）')
            .filter('_type == "product" && category._ref == $catId')
            .params({ catId: categoryId })
            .defaultOrdering([
              { field: 'sortOrder', direction: 'asc' },
              { field: 'name', direction: 'asc' }
            ])
        )
    );

  return S.list()
    .id('aquarium-content')
    .title('水博館官網管理系統')
    .defaultLayout('detail')
    .items([
      promoWeeklyNew,
      promoSpecialOffers,
      promoEquipmentSale,
      S.listItem().id('products-all').title('全部商品').child(allProducts),
      productsByCategorySort,
      orderableDocumentListDeskItem({
        type: 'category',
        S,
        context,
        title: '商品分類（拖曳排序）'
      })
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
  // 寫入／拖曳排序：請在 Studio 右上角登入；並在 sanity.io/manage → API → CORS 加入
  // http://localhost:3334（npm run studio）、http://localhost:3333（npm run dev 的 /admin）
  // 勿設定 auth: { token }（v3 的 AuthConfig 不支援，無法以此帶入寫入權限）
  plugins: [structureTool({ structure })],
  theme: studioTheme,
  schema: {
    types: schemaTypes
  }
});

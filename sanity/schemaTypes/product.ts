import { defineArrayMember, defineField, defineType } from 'sanity';
import { HeroSpotlightToggle } from '../components/HeroSpotlightToggle';

const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SLUG_LEN = 4;

/** Studio 新建文件時初始 slug：小寫英文 + 數字，共 36^SLUG_LEN 種 */
function randomProductSlug(): string {
  return Array.from({ length: SLUG_LEN }, () => SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)]).join(
    ''
  );
}

/**
 * 與 4 碼 slug 符號空間一致：每位 36 種、共 4 位 → 36^4 種組合，此處用「序號上限」36^4 - 1 作預設，
 * 比一般手填 1、2、3… 都大，新建商品預設排在該分類最後（仍可比此值更大以微調）。
 */
const SORT_ORDER_DEFAULT_LAST = 36 ** SLUG_LEN - 1;

function defaultCategorySortOrderStudio(): number {
  return SORT_ORDER_DEFAULT_LAST;
}

export const productType = defineType({
  name: 'product',
  title: '商品／展示項目',
  type: 'document',
  orderings: [
    {
      title: '分類內排序（小→大）',
      name: 'sortOrderAsc',
      by: [
        { field: 'sortOrder', direction: 'asc' },
        { field: 'name', direction: 'asc' }
      ]
    },
    {
      title: '名稱',
      name: 'nameAsc',
      by: [{ field: 'name', direction: 'asc' }]
    }
  ],
  groups: [
    { name: 'basic', title: '基本資訊' },
    { name: 'display', title: '顯示/排序' },
    { name: 'images', title: '圖片' },
    { name: 'seo', title: 'SEO' }
  ],
  // 陣列順序＝Studio「全部欄位」由上而下；與 groups 順序一致：基本 → 顯示/排序 → 圖片 → SEO
  fields: [
    // —— 基本資訊 ——
    defineField({
      name: 'name',
      title: '名稱',
      type: 'string',
      group: 'basic',
      validation: (Rule) => Rule.required()
    }),
    defineField({
      name: 'slug',
      title: '網址 slug（系統自動生成，4 碼）',
      type: 'slug',
      hidden: true,
      readOnly: true,
      group: 'basic',
      initialValue: () => ({ current: randomProductSlug() }),
      validation: (Rule) => Rule.required()
    }),
    defineField({
      name: 'category',
      title: '分類',
      type: 'reference',
      to: [{ type: 'category' }],
      group: 'basic',
      validation: (Rule) => Rule.required()
    }),
    defineField({
      name: 'excerpt',
      title: '短述（列表用）',
      type: 'text',
      rows: 2,
      group: 'basic'
    }),
    defineField({
      name: 'body',
      title: '內文（富文本）',
      description: '商品介紹頁主要內容；未填「短述」時會從此處摘錄列表預覽。',
      type: 'array',
      of: [{ type: 'block' }],
      group: 'basic'
    }),
    // —— 顯示/排序 ——
    defineField({
      name: 'sortOrder',
      title: '分類內排序（數字越小越前面）',
      description:
        `建議用左側「依分類調整順序」對照列表調整排序`,
      type: 'number',
      group: 'display',
      initialValue: defaultCategorySortOrderStudio
    }),
    defineField({
      name: 'enabled',
      title: '上架/下架',
      type: 'boolean',
      group: 'display',
      initialValue: true
    }),
    defineField({
      name: 'featured',
      title: '首頁熱銷',
      type: 'boolean',
      initialValue: false,
      group: 'display'
    }),
    defineField({
      name: 'featuredSortOrder',
      title: '首頁熱銷排序（數字越小越前面）',
      type: 'number',
      group: 'display'
    }),
    defineField({
      name: 'heroSpotlight',
      title: '主打商品',
      description:
        '首頁只顯示最近 3 筆。若已開滿 3筆，請關閉較舊的再開新主打',
      type: 'boolean',
      initialValue: false,
      group: 'display',
      components: {
        input: HeroSpotlightToggle
      }
    }),
    defineField({
      name: 'heroSpotlightActivatedAt',
      title: '主打啟用時間（自動）',
      description: '開啟主打時自動寫入；用於首頁排序（最近開啟者優先）。',
      type: 'datetime',
      group: 'display',
      readOnly: true,
      hidden: true
    }),
    // —— 圖片 ——
    defineField({
      name: 'image',
      title: '圖片（列表主圖／輪播第一張）',
      group: 'images',
      type: 'image',
      options: { hotspot: true },
      fields: [
        defineField({
          name: 'alt',
          type: 'string',
          title: '替代文字（無障礙）',
          hidden: true
        }),
        defineField({
          name: 'caption',
          type: 'string',
          title: '圖片說明（可選）',
          hidden: true
        })
      ]
    }),
    defineField({
      name: 'gallery',
      title: '更多圖片（詳情頁輪播）',
      description: '選填。',
      group: 'images',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'image',
          options: { hotspot: true },
          fields: [
            defineField({
              name: 'alt',
              type: 'string',
              title: '替代文字（無障礙）',
              hidden: true
            }),
            defineField({
              name: 'caption',
              type: 'string',
              title: '圖片說明（可選）',
              hidden: true
            })
          ]
        })
      ],
      options: { layout: 'grid' }
    }),
    // —— SEO ——
    defineField({
      name: 'seoTitle',
      title: 'SEO 標題',
      type: 'string',
      group: 'seo',
      hidden: true
    }),
    defineField({
      name: 'seoKeywords',
      title: 'SEO 關鍵字（逗號、頓號分隔或多筆）',
      type: 'array',
      group: 'seo',
      of: [{ type: 'string' }],
      options: { layout: 'tags' }
    }),
    defineField({
      name: 'seoDescription',
      title: 'SEO 描述',
      type: 'text',
      rows: 3,
      group: 'seo',
      hidden: true
    })
  ],
  preview: {
    select: {
      title: 'name',
      media: 'image',
      cat: 'category.name',
      enabled: 'enabled',
      sortOrder: 'sortOrder',
      featured: 'featured',
      heroSpotlight: 'heroSpotlight'
    },
    prepare({
      title,
      media,
      cat,
      enabled,
      sortOrder,
      featured,
      heroSpotlight
    }: {
      title?: string;
      media?: any;
      cat?: string;
      enabled?: boolean;
      sortOrder?: number;
      featured?: boolean;
      heroSpotlight?: boolean;
    }) {
      const badges = [featured ? '熱銷' : '', heroSpotlight ? '主打' : ''].filter(Boolean).join(' · ');
      return {
        title,
        subtitle: `${cat ?? ''} · ${enabled ? '上架' : '下架'} · 排序:${sortOrder ?? SORT_ORDER_DEFAULT_LAST}${badges ? ` · ${badges}` : ''}`,
        media: media as any
      };
    }
  }
});

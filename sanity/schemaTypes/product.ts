import { defineArrayMember, defineField, defineType } from 'sanity';

const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
function random6(): string {
  // Sanity schema 內用於產生不可編輯的文件 slug
  return Array.from({ length: 6 }, () => SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)]).join(
    ''
  );
}

function defaultCategorySortOrder(): number {
  // 新建商品預設排在分類最後：用目前時間戳，通常會比既有的 1..N 大很多
  return Date.now();
}

export const productType = defineType({
  name: 'product',
  title: '商品／展示項目',
  type: 'document',
  groups: [
    { name: 'basic', title: '基本資訊' },
    { name: 'display', title: '顯示/排序' },
    { name: 'images', title: '圖片' },
    { name: 'seo', title: 'SEO' }
  ],
  fields: [
    defineField({
      name: 'name',
      title: '名稱',
      type: 'string',
      group: 'basic',
      validation: (Rule) => Rule.required()
    }),
    defineField({
      name: 'slug',
      title: '網址 slug（系統自動生成）',
      type: 'slug',
      hidden: true, // 不讓使用者手動自訂
      readOnly: true, // 保障後續不被編輯
      group: 'basic',
      initialValue: () => ({ current: random6() }),
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
      name: 'sortOrder',
      title: '分類內排序（數字越小越前面）',
      type: 'number',
      group: 'display',
      initialValue: defaultCategorySortOrder
    }),
    defineField({
      name: 'enabled',
      title: '上架/下架',
      type: 'boolean',
      group: 'display',
      initialValue: true
    }),
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
      description: '選填。會與上方主圖合併顯示；卡片列表仍只使用主圖。',
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
    defineField({
      name: 'excerpt',
      title: '短述（列表用）',
      type: 'text',
      rows: 2,
      group: 'basic',
    }),
    defineField({
      name: 'description',
      title: '內文（介紹頁）',
      type: 'text',
      rows: 8,
      group: 'basic'
    }),
    defineField({
      name: 'featured',
      title: '首頁精選',
      type: 'boolean',
      initialValue: false,
      group: 'display'
    }),
    defineField({
      name: 'seoTitle',
      title: 'SEO 標題',
      type: 'string',
      group: 'seo',
      hidden: true
    }),
    defineField({
      name: 'seoKeywords',
      title: 'SEO 關鍵字（以逗號分隔或多筆）',
      type: 'array',
      group: 'seo',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
      // 讓你手動填寫 SEO 關鍵字
    }),
    defineField({
      name: 'seoDescription',
      title: 'SEO 描述',
      type: 'text',
      rows: 3,
      group: 'seo',
      hidden: true
    }),
  ],
  preview: {
    select: {
      title: 'name',
      media: 'image',
      cat: 'category.name',
      enabled: 'enabled',
      sortOrder: 'sortOrder',
      featured: 'featured',
    },
    prepare({
      title,
      media,
      cat,
      enabled,
      sortOrder,
      featured
    }: {
      title?: string;
      media?: any;
      cat?: string;
      enabled?: boolean;
      sortOrder?: number;
      featured?: boolean;
    }) {
      return {
        title,
        subtitle: `${cat ?? ''} · ${enabled ? '上架' : '下架'} · 排序:${sortOrder ?? 100}${featured ? ' · 熱銷' : ''}`,
        media: media as any
      };
    }
  }
});

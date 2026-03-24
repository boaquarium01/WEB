import { defineField, defineType } from 'sanity';

export const productType = defineType({
  name: 'product',
  title: '商品／展示項目',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: '名稱',
      type: 'string',
      validation: (Rule) => Rule.required()
    }),
    defineField({
      name: 'slug',
      title: '網址 slug（建議英文小寫＋連字號，全站唯一）',
      type: 'slug',
      options: {
        source: 'name',
        maxLength: 96
      },
      validation: (Rule) => Rule.required()
    }),
    defineField({
      name: 'category',
      title: '分類',
      type: 'reference',
      to: [{ type: 'category' }],
      validation: (Rule) => Rule.required()
    }),
    defineField({
      name: 'image',
      title: '圖片',
      type: 'image',
      options: { hotspot: true },
      fields: [
        defineField({
          name: 'alt',
          type: 'string',
          title: '替代文字（無障礙）'
        })
      ]
    }),
    defineField({
      name: 'excerpt',
      title: '短述（列表用）',
      type: 'text',
      rows: 2
    }),
    defineField({
      name: 'description',
      title: '內文（介紹頁）',
      type: 'text',
      rows: 8
    }),
    defineField({
      name: 'featured',
      title: '首頁精選',
      type: 'boolean',
      initialValue: false
    }),
    defineField({
      name: 'isPlaceholder',
      title: '占位範例',
      description: '僅測試用，正式資料請勿勾選',
      type: 'boolean',
      initialValue: false
    })
  ],
  preview: {
    select: {
      title: 'name',
      media: 'image',
      cat: 'category.name',
      ph: 'isPlaceholder'
    },
    prepare({ title, media, cat, ph }) {
      return {
        title,
        subtitle: `${cat ?? ''}${ph ? ' · 占位' : ''}`,
        media
      };
    }
  }
});

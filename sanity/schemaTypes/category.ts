import { defineField, defineType } from 'sanity';

export const categoryType = defineType({
  name: 'category',
  title: '商品分類',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: '分類名稱',
      type: 'string',
      validation: (Rule) => Rule.required()
    }),
    defineField({
      name: 'slug',
      title: '分類代號（網址）',
      type: 'slug',
      options: {
        source: 'name',
        maxLength: 96
      },
      validation: (Rule) => Rule.required()
    }),
    defineField({
      name: 'sortOrder',
      title: '排序（數字越小越前面）',
      type: 'number',
      initialValue: 100
    })
  ],
  preview: {
    select: {
      title: 'name',
      order: 'sortOrder',
      slug: 'slug.current'
    },
    prepare({ title, order, slug }) {
      return {
        title,
        subtitle: `排序: ${order ?? 100} · ${slug ?? ''}`
      };
    }
  }
});

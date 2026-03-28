import { orderRankField, orderRankOrdering } from '@sanity/orderable-document-list';
import { defineField, defineType } from 'sanity';

export const categoryType = defineType({
  name: 'category',
  title: '商品分類',
  type: 'document',
  orderings: [orderRankOrdering],
  fields: [
    orderRankField({ type: 'category', newItemPosition: 'after' }),
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
      title: '排序（備援，舊資料）',
      description: '請改由左側「商品分類（拖曳排序）」調整順序；此欄已隱藏，僅作舊資料相容。',
      type: 'number',
      hidden: true,
      initialValue: 100
    })
  ],
  preview: {
    select: {
      title: 'name',
      slug: 'slug.current'
    },
    prepare({ title, slug }) {
      return {
        title,
        subtitle: slug ?? ''
      };
    }
  }
});

import { defineArrayMember, defineField, defineType } from 'sanity';

export const promotionType = defineType({
  name: 'promotion',
  title: '促銷分頁',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: '標題',
      type: 'string',
      hidden: true,
      readOnly: true,
      initialValue: ({ document }) => {
        const id = String((document as { _id?: string } | undefined)?._id ?? '');
        if (id === 'promotion-weekly-new') return '每週新進魚隻🐠';
        if (id === 'promotion-special-offers') return '預定優惠';
        if (id === 'promotion-equipment-sale') return '器材促銷';
        return '';
      },
      validation: (Rule) => Rule.required()
    }),
    defineField({
      name: 'slug',
      title: '網址 slug',
      description: '建立後 slug 會鎖定，避免連結失效（第一次存檔前可調整）。',
      type: 'slug',
      hidden: true,
      options: {
        source: 'title',
        maxLength: 96,
        /**
         * Studio 端若因網路/CORS/登入狀態導致無法呼叫 uniqueness API，會誤判「slug 已被使用」而卡住建檔。
         * 本專案促銷頁 slug 為固定三個入口，因此直接略過 uniqueness 檢查，避免店內環境網路阻擋時無法操作。
         */
        isUnique: () => true,
        slugify: (input: string) =>
          String(input ?? '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
      },
      initialValue: ({ document }) => {
        const id = String((document as { _id?: string } | undefined)?._id ?? '');
        if (id === 'promotion-weekly-new') return { current: 'weekly-new' };
        if (id === 'promotion-special-offers') return { current: 'special-offers' };
        if (id === 'promotion-equipment-sale') return { current: 'equipment-sale' };
        return { current: '' };
      },
      readOnly: ({ value, document }) => {
        const id = String((document as { _id?: string } | undefined)?._id ?? '');
        if (
          id === 'promotion-weekly-new' ||
          id === 'promotion-special-offers' ||
          id === 'promotion-equipment-sale'
        ) {
          return true;
        }
        return Boolean(value?.current);
      },
      validation: (Rule) => Rule.required()
    }),
    defineField({
      name: 'content',
      title: '內容（文字）',
      description: '固定小高度文字框（兩行），可直接輸入。',
      type: 'text',
      rows: 2,
      initialValue: '\n'
    }),
    defineField({
      name: 'promoImages',
      title: '促銷圖片（最多 25 張）',
      description:
        '一次加多張：請從檔案總管一次選多個檔案，拖曳到本區（點「上傳」開檔案視窗時，多數瀏覽器一次只能選一張）。可拖曳排序。不啟用裁切熱點。',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'image',
          options: { hotspot: false }
        })
      ],
      options: { layout: 'grid' },
      validation: (Rule) => Rule.max(25)
    })
  ],
  preview: {
    select: {
      title: 'title',
      slug: 'slug.current',
      media: 'promoImages.0'
    },
    prepare({ title, slug, media }) {
      return {
        title,
        subtitle: slug ?? '',
        media
      };
    }
  }
});


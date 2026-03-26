import { createClient } from '@sanity/client';
import type { APIRoute } from 'astro';

const API_VERSION = '2025-03-18';

const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
function random6(): string {
  return Array.from({ length: 6 }, () => SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)]).join('');
}

// 站台網址 slug 不需要人工自訂：一律隨機生成 6 碼
function slugify(_input: string): string {
  return random6();
}

function excerptFromDescription(description: string): string {
  const d = String(description ?? '').trim();
  if (!d) return '';
  // Sanity 的 excerpt 顯示 2 列，這裡用長度做保守截斷
  return d.length > 140 ? `${d.slice(0, 140).trim()}...` : d;
}

function readSanityEnvForWrite() {
  const projectId =
    process.env.SANITY_STUDIO_PROJECT_ID?.trim() ||
    process.env.PUBLIC_SANITY_PROJECT_ID?.trim() ||
    '';
  const dataset =
    process.env.SANITY_STUDIO_DATASET?.trim() ||
    process.env.PUBLIC_SANITY_DATASET?.trim() ||
    'production';

  // 常見寫入 token：SANITY_STUDIO_TOKEN / SANITY_AUTH_TOKEN / 其他自訂 token
  const token =
    process.env.SANITY_STUDIO_TOKEN?.trim() ||
    process.env.SANITY_AUTH_TOKEN?.trim() ||
    process.env.SANITY_API_TOKEN?.trim() ||
    process.env.SANITY_WRITE_TOKEN?.trim() ||
    '';

  return { projectId, dataset, token };
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const { projectId, dataset, token } = readSanityEnvForWrite();
    if (!projectId) {
      return new Response(JSON.stringify({ ok: false, message: '缺少 SANITY_STUDIO_PROJECT_ID / PUBLIC_SANITY_PROJECT_ID' }), {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }
    if (!token) {
      return new Response(
        JSON.stringify({
          ok: false,
          message:
            '缺少寫入 Token（請設定 SANITY_STUDIO_TOKEN 或 SANITY_AUTH_TOKEN 等）。目前只能讀取，無法 create 到 Sanity。'
        }),
        {
          status: 401,
          headers: { 'content-type': 'application/json; charset=utf-8' }
        }
      );
    }

    const formData = await request.formData();

    const name = String(formData.get('name') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();
    const categoryId = String(formData.get('categoryId') ?? '').trim(); // 這裡使用 category.slug.current
    const featured = formData.get('featured') === 'true' || formData.get('featured') === 'on';
    const images = formData.getAll('images').filter(Boolean) as File[];

    if (!name) {
      return new Response(JSON.stringify({ ok: false, message: '請輸入名稱' }), {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }
    if (!description) {
      return new Response(JSON.stringify({ ok: false, message: '請輸入敘述' }), {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }
    if (!categoryId) {
      return new Response(JSON.stringify({ ok: false, message: '請選擇分類' }), {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }
    if (!images.length) {
      return new Response(JSON.stringify({ ok: false, message: '請至少上傳一張圖片' }), {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }

    const client = createClient({
      projectId,
      dataset,
      useCdn: false,
      apiVersion: API_VERSION,
      token
    });

    const uploadedAssets = [];
    for (const file of images) {
      // sanity assets.upload 可直接吃 File/Blob（來自表單上傳）
      const asset = await client.assets.upload('image', file, {
        filename: file.name || 'upload.jpg',
        contentType: file.type || undefined
      });
      uploadedAssets.push(asset);
    }

    const mainAsset = uploadedAssets[0];
    const galleryAssets = uploadedAssets.slice(1);

    // 把 category slug.current 轉成真正的 Sanity document _id（reference 必須用 _id）
    const categoryDocId = await client.fetch<string | null>(
      `*[_type == "category" && slug.current == $categorySlug][0]._id`,
      { categorySlug: categoryId }
    );
    if (!categoryDocId) {
      return new Response(JSON.stringify({ ok: false, message: '找不到對應的分類文件（category.slug.current 不存在）' }), {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }

    const slugCurrent = slugify(name);
    const excerpt = excerptFromDescription(description);

    const mainImage = {
      _type: 'image',
      asset: {
        _type: 'reference',
        _ref: mainAsset._id
      }
    };

    const gallery =
      galleryAssets.length > 0
        ? galleryAssets.map((a) => ({
            _type: 'image',
            asset: {
              _type: 'reference',
              _ref: a._id
            }
          }))
        : undefined;

    const created = await client.create({
      _type: 'product',
      name,
      slug: {
        _type: 'slug',
        current: slugCurrent
      },
      category: {
        _type: 'reference',
        _ref: categoryDocId
      },
      image: mainImage,
      ...(gallery ? { gallery } : {}),
      excerpt,
      description,
      featured,
      // slug / placeholder 由 schema 控制；這裡不再寫入 isPlaceholder
    });

    return new Response(JSON.stringify({ ok: true, id: created?._id }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, message }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }
};


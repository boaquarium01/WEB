import { createClient } from '@sanity/client';
import type { APIRoute } from 'astro';
import { nextSortOrderForCategory } from '../../../lib/nextProductSortOrder';

const API_VERSION = '2025-03-18';

const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SLUG_LEN = 4;

/** 小寫英文 + 數字，長度 SLUG_LEN（共 36^SLUG_LEN 種組合） */
function randomProductSlug(): string {
  return Array.from({ length: SLUG_LEN }, () => SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)]).join(
    ''
  );
}

async function pickUniqueProductSlug(client: ReturnType<typeof createClient>): Promise<string> {
  const maxAttempts = 100;
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = randomProductSlug();
    const taken = await client.fetch<string | null>(
      `*[_type == "product" && slug.current == $slug][0]._id`,
      { slug: candidate }
    );
    if (!taken) return candidate;
  }
  throw new Error('無法產生唯一商品 slug（碰撞過多），請稍後再試');
}

function excerptFromContent(text: string): string {
  const d = String(text ?? '').trim();
  if (!d) return '';
  return d.length > 140 ? `${d.slice(0, 140).trim()}...` : d;
}

function randomBlockKey(): string {
  return Math.random().toString(36).slice(2, 11);
}

/** 表單多行純文字 → Portable Text blocks（寫入 body，不再使用 description 欄位） */
function linesToPortableBody(text: string): Record<string, unknown>[] {
  const lines = String(text)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.map((line, i) => ({
    _type: 'block',
    _key: `b${i}-${randomBlockKey()}`,
    style: 'normal',
    markDefs: [],
    children: [
      {
        _type: 'span',
        _key: `s${i}-${randomBlockKey()}`,
        text: line,
        marks: []
      }
    ]
  }));
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
    const contentText = String(formData.get('description') ?? '').trim();
    const categoryId = String(formData.get('categoryId') ?? '').trim(); // 這裡使用 category.slug.current
    const featured = formData.get('featured') === 'true' || formData.get('featured') === 'on';
    const images = formData.getAll('images').filter(Boolean) as File[];

    if (!name) {
      return new Response(JSON.stringify({ ok: false, message: '請輸入名稱' }), {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }
    if (!contentText) {
      return new Response(JSON.stringify({ ok: false, message: '請輸入商品介紹（將存為富文本內文）' }), {
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

    const slugCurrent = await pickUniqueProductSlug(client);
    const sortOrder = await nextSortOrderForCategory(client, categoryDocId);
    const excerpt = excerptFromContent(contentText);
    const body = linesToPortableBody(contentText);

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
      sortOrder,
      category: {
        _type: 'reference',
        _ref: categoryDocId
      },
      image: mainImage,
      ...(gallery ? { gallery } : {}),
      excerpt,
      body,
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


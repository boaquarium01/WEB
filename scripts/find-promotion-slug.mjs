import { createClient } from '@sanity/client';

const API_VERSION = '2025-03-18';

const projectId =
  (process.env.PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID || '').trim() || 'iz7fvprm';
const dataset =
  (process.env.PUBLIC_SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || '').trim() || 'production';

const slug = String(process.argv[2] ?? '').trim();
if (!slug) {
  console.error('Usage: node scripts/find-promotion-slug.mjs <slug>');
  process.exit(1);
}

const client = createClient({ projectId, dataset, apiVersion: API_VERSION, useCdn: false });

const queryPromotion = `*[_type=="promotion" && slug.current==$slug]{_id,title,"slug":slug.current,_createdAt,_updatedAt} | order(_updatedAt desc)`;
const queryAny = `*[(defined(slug.current) && slug.current==$slug)]{_id,_type,title,name,"slug":slug.current,_createdAt,_updatedAt} | order(_updatedAt desc)`;

const [promotions, anyDocs] = await Promise.all([
  client.fetch(queryPromotion, { slug }),
  client.fetch(queryAny, { slug })
]);

console.log(
  JSON.stringify(
    {
      projectId,
      dataset,
      slug,
      promotionCount: promotions?.length ?? 0,
      promotions,
      anyCount: anyDocs?.length ?? 0,
      anyDocs
    },
    null,
    2
  )
);


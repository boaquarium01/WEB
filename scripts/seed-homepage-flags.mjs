/**
 * Seed homepage flags on V2 Sanity: 3 hero + 10 featured from enabled products.
 * Usage: node scripts/seed-homepage-flags.mjs
 */
import { createClient } from '@sanity/client';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env') });

const projectId = process.env.PUBLIC_SANITY_PROJECT_ID || 'jt3vrzpz';
const dataset = process.env.PUBLIC_SANITY_DATASET || 'production';
const token = (process.env.SANITY_API_TOKEN || process.env.SANITY_STUDIO_TOKEN || '').trim();
if (!token) {
	console.error('缺少 SANITY_API_TOKEN');
	process.exit(1);
}

const client = createClient({ projectId, dataset, apiVersion: '2025-03-18', useCdn: false, token });

const products = await client.fetch(
	`*[_type == "product" && defined(slug.current) && enabled != false] | order(name asc)[0...40]{ _id, name }`,
);
if (!products.length) {
	console.error('沒有可上架商品');
	process.exit(1);
}

const hero = products.slice(0, 3);
const featured = products.slice(0, 10);
const now = new Date().toISOString();

let tx = client.transaction();
for (let i = 0; i < hero.length; i++) {
	tx = tx.patch(hero[i]._id, (p) =>
		p.set({
			heroSpotlight: true,
			heroSpotlightActivatedAt: new Date(Date.now() - i * 1000).toISOString(),
			featured: true,
			featuredSortOrder: i + 1,
		}),
	);
}
for (let i = 3; i < featured.length; i++) {
	tx = tx.patch(featured[i]._id, (p) =>
		p.set({
			featured: true,
			featuredSortOrder: i + 1,
		}),
	);
}
await tx.commit();

console.log('hero:', hero.map((p) => p.name).join('、'));
console.log('featured:', featured.map((p) => p.name).join('、'));
console.log('ok', { projectId, dataset, at: now });

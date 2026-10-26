import { createImageUrlBuilder } from '@sanity/image-url';
import { createClient, type SanityClient } from '@sanity/client';
import { getServerEnv } from '../env';
import { readSanityProjectDataset } from './env';

let readClient: SanityClient | null = null;

/**
 * Read-only Sanity client for content (products, pages, SEO).
 * Never mutates Sanity schema.
 */
export function getSanityClient(): SanityClient {
	if (readClient) {
		return readClient;
	}

	// Only the Sanity project/dataset are needed here; falls back to jt3vrzpz/production
	// so a missing PUBLIC_SITE_URL or Sanity variable never knocks out product images.
	const { projectId, dataset } = readSanityProjectDataset();
	let token: string | undefined;
	try {
		token = getServerEnv().SANITY_API_READ_TOKEN;
	} catch {
		token = undefined;
	}

	readClient = createClient({
		projectId,
		dataset,
		apiVersion: '2025-03-18',
		useCdn: !token,
		perspective: 'published',
		...(token ? { token } : {}),
	});

	return readClient;
}

/** Build CDN URL for a Sanity image source. */
export function urlForImage(
	source: Parameters<ReturnType<typeof createImageUrlBuilder>['image']>[0],
) {
	return createImageUrlBuilder(getSanityClient()).image(source);
}

/** Connectivity check used by /api/health. */
export async function pingSanity(): Promise<{
	ok: true;
	projectId: string;
	dataset: string;
}> {
	const client = getSanityClient();
	const { projectId, dataset } = readSanityProjectDataset();
	await client.fetch('*[0]._id');
	return { ok: true, projectId, dataset };
}

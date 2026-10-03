import { createImageUrlBuilder } from '@sanity/image-url';
import { createClient, type SanityClient } from '@sanity/client';
import { getPublicEnv, getServerEnv } from '../env';

let readClient: SanityClient | null = null;

/**
 * Read-only Sanity client for content (products, pages, SEO).
 * Never mutates Sanity schema.
 */
export function getSanityClient(): SanityClient {
	if (readClient) {
		return readClient;
	}

	const publicEnv = getPublicEnv();
	let token: string | undefined;
	try {
		token = getServerEnv().SANITY_API_READ_TOKEN;
	} catch {
		token = undefined;
	}

	readClient = createClient({
		projectId: publicEnv.PUBLIC_SANITY_PROJECT_ID,
		dataset: publicEnv.PUBLIC_SANITY_DATASET,
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
	const publicEnv = getPublicEnv();
	await client.fetch('*[0]._id');
	return {
		ok: true,
		projectId: publicEnv.PUBLIC_SANITY_PROJECT_ID,
		dataset: publicEnv.PUBLIC_SANITY_DATASET,
	};
}

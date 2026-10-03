/**
 * Sync Sanity products → PostgreSQL.
 *
 * Usage:
 *   npm run sync:products
 */
import 'dotenv/config';
import { closeDb } from '../src/lib/db/client.ts';
import { getPublicEnv } from '../src/lib/env.ts';
import { syncProductsFromSanity } from '../src/lib/services/product-sync.ts';

const publicEnv = getPublicEnv();
console.log(
	`Syncing from Sanity project=${publicEnv.PUBLIC_SANITY_PROJECT_ID} dataset=${publicEnv.PUBLIC_SANITY_DATASET}`,
);

try {
	const result = await syncProductsFromSanity();
	console.log('Product sync complete');
	console.log(result);

	if (result.fetched === 0) {
		console.log(
			'No products found. Dataset v2 may still be empty — create products in Sanity Studio (dataset v2), then re-run.',
		);
	}

	if (result.errors.length > 0) {
		process.exitCode = 1;
	}
} catch (error) {
	console.error('Product sync failed');
	console.error(error);
	process.exitCode = 1;
} finally {
	await closeDb();
}

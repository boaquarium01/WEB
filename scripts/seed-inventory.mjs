import 'dotenv/config';
import postgres from 'postgres';

/**
 * Ensure each active SKU has an inventory row at STORE.
 * Default on_hand = -1 (unlimited) for rows that do not yet exist.
 */
const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is missing');
	process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });

try {
	const [store] = await sql`
		select id from locations where type = 'STORE' and is_active = true limit 1
	`;
	if (!store) {
		throw new Error('STORE location missing. Run npm run db:seed first.');
	}

	const inserted = await sql`
		insert into inventory (product_sku_id, location_id, on_hand, reserved, low_stock_threshold)
		select ps.id, ${store.id}::uuid, -1, 0, 2
		from product_skus ps
		where ps.is_active = true
			and not exists (
				select 1 from inventory i
				where i.product_sku_id = ps.id and i.location_id = ${store.id}::uuid
			)
		returning id
	`;

	console.log(`Seeded inventory rows: ${inserted.length}`);
} catch (error) {
	console.error('Inventory seed failed:', error);
	process.exitCode = 1;
} finally {
	await sql.end({ timeout: 5 });
}

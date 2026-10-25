ALTER TABLE "order_items" ADD COLUMN "sku_name_snapshot" text;
--> statement-breakpoint
UPDATE "order_items" AS oi
SET "sku_name_snapshot" = ps."name"
FROM "product_skus" AS ps
WHERE oi."product_sku_id" = ps."id";

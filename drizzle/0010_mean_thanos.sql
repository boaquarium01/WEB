ALTER TABLE "product_skus" ADD COLUMN "source_sku" text;--> statement-breakpoint
CREATE UNIQUE INDEX "product_skus_source_sku_uidx" ON "product_skus" USING btree ("source_sku");
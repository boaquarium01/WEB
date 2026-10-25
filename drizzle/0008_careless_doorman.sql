CREATE TABLE "product_price_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"min_quantity" integer NOT NULL,
	"max_quantity" integer,
	"unit_price" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_price_tiers_min_check" CHECK ("product_price_tiers"."min_quantity" >= 2),
	CONSTRAINT "product_price_tiers_max_check" CHECK ("product_price_tiers"."max_quantity" IS NULL OR "product_price_tiers"."max_quantity" >= "product_price_tiers"."min_quantity"),
	CONSTRAINT "product_price_tiers_price_check" CHECK ("product_price_tiers"."unit_price" >= 0)
);
--> statement-breakpoint
ALTER TABLE "product_skus" ADD COLUMN "preparation_days" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "minimum_purchase_quantity" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_price_tiers" ADD CONSTRAINT "product_price_tiers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_price_tiers_product_min_uidx" ON "product_price_tiers" USING btree ("product_id","min_quantity");--> statement-breakpoint
CREATE INDEX "product_price_tiers_product_sort_idx" ON "product_price_tiers" USING btree ("product_id","sort_order");--> statement-breakpoint
ALTER TABLE "product_skus" ADD CONSTRAINT "product_skus_preparation_days_check" CHECK ("product_skus"."preparation_days" IS NULL OR "product_skus"."preparation_days" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_min_purchase_quantity_check" CHECK ("products"."minimum_purchase_quantity" >= 1);

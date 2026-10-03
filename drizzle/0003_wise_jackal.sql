CREATE TABLE "shipping_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"fee" integer DEFAULT 0 NOT NULL,
	"free_shipping_threshold" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_methods_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE INDEX "shipping_methods_active_sort_idx" ON "shipping_methods" USING btree ("is_active","sort_order");
--> statement-breakpoint
INSERT INTO "shipping_methods" ("code", "name", "fee", "free_shipping_threshold", "is_active", "sort_order")
VALUES ('home-delivery', '宅配', 0, NULL, true, 0);

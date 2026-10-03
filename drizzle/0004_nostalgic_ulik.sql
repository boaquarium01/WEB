CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"status" "order_status" NOT NULL,
	"payment_status" "order_payment_status" NOT NULL,
	"shipping_status" "shipping_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_status_history_order_created_idx" ON "order_status_history" USING btree ("order_id","created_at");
--> statement-breakpoint
INSERT INTO "order_status_history" ("order_id", "status", "payment_status", "shipping_status", "created_at")
SELECT "id", 'PENDING_PAYMENT', 'UNPAID', 'NOT_SHIPPED', "created_at" FROM "orders";
--> statement-breakpoint
INSERT INTO "order_status_history" ("order_id", "status", "payment_status", "shipping_status", "created_at")
SELECT p."order_id", 'PAYMENT_SUBMITTED', 'AWAITING_VERIFICATION', 'NOT_SHIPPED', s."submitted_at"
FROM "payment_submissions" s JOIN "payments" p ON p."id" = s."payment_id";
--> statement-breakpoint
INSERT INTO "order_status_history" ("order_id", "status", "payment_status", "shipping_status", "created_at")
SELECT p."order_id", 'PROCESSING', 'PAID', 'PREPARING', p."paid_at"
FROM "payments" p WHERE p."paid_at" IS NOT NULL;
--> statement-breakpoint
INSERT INTO "order_status_history" ("order_id", "status", "payment_status", "shipping_status", "created_at")
SELECT o."id", o."status", o."payment_status", o."shipping_status", o."updated_at"
FROM "orders" o
WHERE o."status" IN ('SHIPPED', 'COMPLETED', 'CANCELLED');

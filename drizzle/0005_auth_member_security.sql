ALTER TABLE "customers" ADD COLUMN "contact_email" text;
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "terms_accepted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "onboarding_completed" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	IF EXISTS (
		SELECT 1 FROM "account" GROUP BY "provider_id", "account_id" HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'Duplicate Better Auth provider identities exist; resolve them without changing user IDs before applying account identity uniqueness.';
	END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_uidx" ON "account" USING btree ("provider_id", "account_id");

ALTER TABLE "discount_codes" ADD COLUMN IF NOT EXISTS "auto_apply" boolean DEFAULT false NOT NULL;

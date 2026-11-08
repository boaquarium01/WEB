CREATE TABLE IF NOT EXISTS "admin_users" (
	"email" text PRIMARY KEY NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

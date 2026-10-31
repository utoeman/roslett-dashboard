ALTER TABLE "shopify_sync" ADD COLUMN "last_run_trigger" text;--> statement-breakpoint
ALTER TABLE "shopify_sync" ADD COLUMN "last_run_result" jsonb;
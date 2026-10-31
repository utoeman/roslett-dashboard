ALTER TABLE "products" ADD COLUMN "shopify_pushed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "shopify_push_hash" text;
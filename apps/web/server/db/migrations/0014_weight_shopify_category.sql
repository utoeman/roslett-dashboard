ALTER TABLE "categories" ADD COLUMN "shopify_category_id" text;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "shopify_category_name" text;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "weight_grams" integer;
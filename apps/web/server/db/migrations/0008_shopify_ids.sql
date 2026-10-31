ALTER TABLE "products" ADD COLUMN "shopify_product_id" text;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "shopify_variant_id" text;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "shopify_inventory_item_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "variants_shopify_variant_idx" ON "variants" USING btree ("shopify_variant_id");
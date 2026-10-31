CREATE TABLE "shopify_sync" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"orders_synced_to" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopify_sync_single_row" CHECK ("shopify_sync"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "shopify_sources" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "shopify_refund_id" text;--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN "shopify_line_item_id" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "shopify_order_id" text;--> statement-breakpoint
CREATE INDEX "refunds_shopify_refund_idx" ON "refunds" USING btree ("shopify_refund_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_shopify_order_idx" ON "sales" USING btree ("shopify_order_id");
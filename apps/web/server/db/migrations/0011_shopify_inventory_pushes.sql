CREATE TABLE "shopify_inventory_pushes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_entry_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"location_id" text NOT NULL,
	"pushed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopify_inventory_pushes_stock_entry_id_unique" UNIQUE("stock_entry_id")
);
--> statement-breakpoint
ALTER TABLE "shopify_inventory_pushes" ADD CONSTRAINT "shopify_inventory_pushes_stock_entry_id_stock_entries_id_fk" FOREIGN KEY ("stock_entry_id") REFERENCES "public"."stock_entries"("id") ON DELETE no action ON UPDATE no action;
CREATE TYPE "public"."fee_kind" AS ENUM('transaction', 'payment', 'listing', 'advertising', 'other');--> statement-breakpoint
CREATE TYPE "public"."fee_source" AS ENUM('flat', 'api');--> statement-breakpoint
CREATE TYPE "public"."sale_status" AS ENUM('open', 'shipped', 'cancelled');--> statement-breakpoint
CREATE TABLE "fees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"kind" "fee_kind" NOT NULL,
	"amount" numeric(14, 4) NOT NULL,
	"source" "fee_source" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_gross" numeric(14, 4) NOT NULL,
	"vat_rate" numeric(5, 4) NOT NULL,
	CONSTRAINT "sale_items_quantity_positive" CHECK ("sale_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid,
	"external_order_number" text NOT NULL,
	"ordered_at" timestamp with time zone NOT NULL,
	"delivery_country" text NOT NULL,
	"shipping_revenue_gross" numeric(14, 4) DEFAULT '0' NOT NULL,
	"postage_cost" numeric(14, 4) DEFAULT '0' NOT NULL,
	"discount_gross" numeric(14, 4) DEFAULT '0' NOT NULL,
	"status" "sale_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "shipping_price_gross" numeric(14, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "free_shipping_from" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "default_postage" numeric(14, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_entries" ADD COLUMN "sale_item_id" uuid;--> statement-breakpoint
ALTER TABLE "fees" ADD CONSTRAINT "fees_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fees_sale_idx" ON "fees" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_items_sale_idx" ON "sale_items" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_items_variant_idx" ON "sale_items" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_channel_order_idx" ON "sales" USING btree ("channel_id","external_order_number");--> statement-breakpoint
CREATE INDEX "sales_ordered_at_idx" ON "sales" USING btree ("ordered_at");--> statement-breakpoint
ALTER TABLE "stock_entries" ADD CONSTRAINT "stock_entries_sale_item_id_sale_items_id_fk" FOREIGN KEY ("sale_item_id") REFERENCES "public"."sale_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_entries_sale_item_idx" ON "stock_entries" USING btree ("sale_item_id");
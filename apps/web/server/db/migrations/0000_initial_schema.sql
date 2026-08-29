CREATE TYPE "public"."cost_item_kind" AS ENUM('fix', 'percent');--> statement-breakpoint
CREATE TYPE "public"."distribution_method" AS ENUM('value', 'quantity');--> statement-breakpoint
CREATE TYPE "public"."pricing_rule" AS ENUM('same_margin', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."stock_entry_kind" AS ENUM('goods_receipt', 'sale', 'return', 'correction', 'stocktake', 'shrinkage');--> statement-breakpoint
CREATE TYPE "public"."stock_entry_source" AS ENUM('manual', 'etsy', 'correction');--> statement-breakpoint
CREATE TABLE "batch_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_entry_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"landed_cost_eur" numeric(14, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"supplier_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"quantity_received" integer NOT NULL,
	"quantity_remaining" integer NOT NULL,
	"purchase_price_foreign" numeric(14, 4) NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"exchange_rate" numeric(14, 6) DEFAULT '1.000000' NOT NULL,
	"purchase_price_eur" numeric(14, 4) NOT NULL,
	"additional_costs_eur" numeric(14, 4) DEFAULT '0' NOT NULL,
	"landed_cost_eur" numeric(14, 4) NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "channel_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"suggested_price" numeric(14, 4),
	"listed_price" numeric(14, 4),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"fee_percent" numeric(6, 4) DEFAULT '0' NOT NULL,
	"fee_fixed" numeric(14, 4) DEFAULT '0' NOT NULL,
	"pricing_rule" "pricing_rule" DEFAULT 'same_margin' NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid,
	"label" text NOT NULL,
	"kind" "cost_item_kind" NOT NULL,
	"value" numeric(14, 4) NOT NULL,
	"input_tax_deductible" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"distribution_method" "distribution_method" DEFAULT 'value' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"kind" "stock_entry_kind" NOT NULL,
	"quantity" integer NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"source" "stock_entry_source" DEFAULT 'manual' NOT NULL,
	"external_reference" text,
	"reversed_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"country" text,
	"note" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"label" text NOT NULL,
	"minimum_stock" integer DEFAULT 0 NOT NULL,
	"base_price_net" numeric(14, 4),
	"vat_rate" numeric(5, 4) DEFAULT '0.1900' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "batch_allocations" ADD CONSTRAINT "batch_allocations_stock_entry_id_stock_entries_id_fk" FOREIGN KEY ("stock_entry_id") REFERENCES "public"."stock_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_allocations" ADD CONSTRAINT "batch_allocations_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_prices" ADD CONSTRAINT "channel_prices_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_prices" ADD CONSTRAINT "channel_prices_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_entries" ADD CONSTRAINT "stock_entries_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "batch_allocations_stock_entry_idx" ON "batch_allocations" USING btree ("stock_entry_id");--> statement-breakpoint
CREATE INDEX "batch_allocations_batch_idx" ON "batch_allocations" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "batches_fifo_idx" ON "batches" USING btree ("variant_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_prices_variant_channel_idx" ON "channel_prices" USING btree ("variant_id","channel_id");--> statement-breakpoint
CREATE INDEX "cost_items_variant_idx" ON "cost_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "stock_entries_variant_idx" ON "stock_entries" USING btree ("variant_id","posted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_entries_external_reference_idx" ON "stock_entries" USING btree ("external_reference") WHERE "stock_entries"."external_reference" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "variants_sku_idx" ON "variants" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "variants_product_idx" ON "variants" USING btree ("product_id");
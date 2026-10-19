-- Goods receipts with positions and additional costs; journal v2 with reversals
-- and shortfalls. The old batch/journal tables are rebuilt; abort if they hold data.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "batches") OR EXISTS (SELECT 1 FROM "stock_entries") OR EXISTS (SELECT 1 FROM "batch_allocations") THEN
    RAISE EXCEPTION 'Migration 0002 requires empty batches, stock_entries and batch_allocations tables.';
  END IF;
END $$;--> statement-breakpoint
DROP TABLE "batch_allocations";--> statement-breakpoint
DROP TABLE "stock_entries";--> statement-breakpoint
DROP TABLE "batches";--> statement-breakpoint
DROP TYPE "public"."stock_entry_kind";--> statement-breakpoint
DROP TYPE "public"."stock_entry_source";--> statement-breakpoint
CREATE TYPE "public"."additional_cost_kind" AS ENUM('freight', 'customs', 'other', 'credit');--> statement-breakpoint
CREATE TYPE "public"."exchange_rate_source" AS ENUM('ecb', 'manual');--> statement-breakpoint
CREATE TYPE "public"."receipt_state" AS ENUM('draft', 'posted');--> statement-breakpoint
CREATE TYPE "public"."stock_entry_kind" AS ENUM('goods_receipt', 'sale', 'return', 'shrinkage', 'own_use', 'stocktake', 'supplier_return', 'reversal');--> statement-breakpoint
CREATE TABLE "goods_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"supplier_id" uuid NOT NULL,
	"invoice_number" text,
	"invoice_date" date NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"exchange_rate" numeric(14, 6) DEFAULT '1.000000' NOT NULL,
	"exchange_rate_source" "exchange_rate_source" DEFAULT 'ecb' NOT NULL,
	"state" "receipt_state" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goods_receipts_number_unique" UNIQUE("number")
);--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goods_receipt_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity_ordered" integer NOT NULL,
	"unit_price_foreign" integer NOT NULL,
	"unit_price_eur" numeric(14, 4) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "additional_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goods_receipt_id" uuid NOT NULL,
	"kind" "additional_cost_kind" NOT NULL,
	"amount_eur" numeric(14, 4) NOT NULL,
	"distribution_method" "distribution_method" DEFAULT 'value' NOT NULL,
	"incurred_on" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "stock_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"kind" "stock_entry_kind" NOT NULL,
	"quantity" integer NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"reverses_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_entries_reverses_id_unique" UNIQUE("reverses_id")
);--> statement-breakpoint
CREATE TABLE "batch_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_entry_id" uuid NOT NULL,
	"batch_id" uuid,
	"quantity" integer NOT NULL,
	"resolved_at" timestamp with time zone
);--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_goods_receipt_id_goods_receipts_id_fk" FOREIGN KEY ("goods_receipt_id") REFERENCES "public"."goods_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "additional_costs" ADD CONSTRAINT "additional_costs_goods_receipt_id_goods_receipts_id_fk" FOREIGN KEY ("goods_receipt_id") REFERENCES "public"."goods_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_entries" ADD CONSTRAINT "stock_entries_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_entries" ADD CONSTRAINT "stock_entries_reverses_id_stock_entries_id_fk" FOREIGN KEY ("reverses_id") REFERENCES "public"."stock_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_allocations" ADD CONSTRAINT "batch_allocations_stock_entry_id_stock_entries_id_fk" FOREIGN KEY ("stock_entry_id") REFERENCES "public"."stock_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_allocations" ADD CONSTRAINT "batch_allocations_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "batches_variant_idx" ON "batches" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "batches_receipt_idx" ON "batches" USING btree ("goods_receipt_id");--> statement-breakpoint
CREATE INDEX "additional_costs_receipt_idx" ON "additional_costs" USING btree ("goods_receipt_id");--> statement-breakpoint
CREATE INDEX "stock_entries_variant_idx" ON "stock_entries" USING btree ("variant_id","posted_at");--> statement-breakpoint
CREATE INDEX "batch_allocations_stock_entry_idx" ON "batch_allocations" USING btree ("stock_entry_id");--> statement-breakpoint
CREATE INDEX "batch_allocations_batch_idx" ON "batch_allocations" USING btree ("batch_id");

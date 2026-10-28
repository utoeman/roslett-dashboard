CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"sale_item_id" uuid,
	"quantity" integer DEFAULT 0 NOT NULL,
	"amount_gross" numeric(14, 4) NOT NULL,
	"restocked" boolean DEFAULT false NOT NULL,
	"damaged" boolean DEFAULT false NOT NULL,
	"refunded_at" timestamp with time zone NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_quantity_not_negative" CHECK ("refunds"."quantity" >= 0),
	CONSTRAINT "refunds_damaged_needs_restock" CHECK (not "refunds"."damaged" or "refunds"."restocked")
);
--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_sale_item_id_sale_items_id_fk" FOREIGN KEY ("sale_item_id") REFERENCES "public"."sale_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refunds_sale_idx" ON "refunds" USING btree ("sale_id");
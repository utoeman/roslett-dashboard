ALTER TABLE "shopify_inventory_pushes" ALTER COLUMN "location_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shopify_inventory_pushes" ADD COLUMN "reason" text DEFAULT 'pushed' NOT NULL;--> statement-breakpoint
-- Stage 4 sends only what is booked from now on; older non-receipt changes are marked, not sent.
INSERT INTO "shopify_inventory_pushes" ("stock_entry_id", "delta", "location_id", "reason")
SELECT e."id", e."quantity", NULL, 'before_stage4'
FROM "stock_entries" e
WHERE e."kind" IN ('shrinkage', 'own_use', 'stocktake', 'supplier_return', 'reversal')
  AND NOT EXISTS (SELECT 1 FROM "shopify_inventory_pushes" p WHERE p."stock_entry_id" = e."id");

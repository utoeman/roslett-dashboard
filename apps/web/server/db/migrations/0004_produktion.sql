CREATE TYPE "public"."receipt_kind" AS ENUM('purchase', 'production');--> statement-breakpoint
ALTER TYPE "public"."additional_cost_kind" ADD VALUE 'fabric' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."additional_cost_kind" ADD VALUE 'accessories' BEFORE 'other';--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD COLUMN "kind" "receipt_kind" DEFAULT 'purchase' NOT NULL;
CREATE TABLE "company_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"manufacturer_name" text NOT NULL,
	"manufacturer_address" text NOT NULL,
	"manufacturer_email" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_settings_single_row" CHECK ("company_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "care_notes" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "safety_notes" text;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "fiber" text;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "fiber_filling" text;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "origin_country" text;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "hs_code" text;
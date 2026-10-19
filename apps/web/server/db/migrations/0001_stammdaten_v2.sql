-- Master data v2: category/color codes, VAT rates, gross prices, generated SKUs.
-- New required columns need empty product tables; abort instead of deleting data.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "products") OR EXISTS (SELECT 1 FROM "variants") THEN
    RAISE EXCEPTION 'Migration 0001 requires empty products and variants tables.';
  END IF;
END $$;--> statement-breakpoint
CREATE TYPE "public"."category_group" AS ENUM('textile', 'decor');--> statement-breakpoint
CREATE TYPE "public"."vat_category" AS ENUM('standard', 'reduced');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"group" "category_group" NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_code_unique" UNIQUE("code")
);--> statement-breakpoint
CREATE TABLE "colors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "colors_code_unique" UNIQUE("code")
);--> statement-breakpoint
CREATE TABLE "vat_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country" text NOT NULL,
	"vat_category" "vat_category" NOT NULL,
	"rate" numeric(5, 4) NOT NULL,
	"valid_from" date NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "vat_rates_country_category_from_idx" ON "vat_rates" USING btree ("country","vat_category","valid_from");--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "category";--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "number" integer GENERATED ALWAYS AS IDENTITY (sequence name "products_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_number_unique" UNIQUE("number");--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "category_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "base_price_gross" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "vat_category" "vat_category" DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" DROP COLUMN "label";--> statement-breakpoint
ALTER TABLE "variants" DROP COLUMN "base_price_net";--> statement-breakpoint
ALTER TABLE "variants" DROP COLUMN "vat_rate";--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "color_id" uuid;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "size" text;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "price_gross" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_color_id_colors_id_fk" FOREIGN KEY ("color_id") REFERENCES "public"."colors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "default_currency" text DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
-- Starting reference data, present in every environment.
INSERT INTO "categories" ("code", "name", "group") VALUES
	('KIS', 'Kissen', 'textile'),
	('DCK', 'Decke', 'textile'),
	('TLF', 'Tischläufer', 'textile'),
	('GTS', 'Geschirrtuch-Set', 'textile'),
	('DEC', 'Deko/Körbe', 'decor'),
	('VAS', 'Vase', 'decor'),
	('KRZ', 'Kerze', 'decor')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
INSERT INTO "colors" ("code", "name") VALUES
	('SAN', 'Sand'),
	('OLI', 'Olive'),
	('NAT', 'Natur'),
	('TER', 'Terrakotta'),
	('STR', 'Streifen'),
	('FEI', 'Feige')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
-- Rates to be verified; valid_from is the app's starting point, not the legal date.
INSERT INTO "vat_rates" ("country", "vat_category", "rate", "valid_from") VALUES
	('DE', 'standard', 0.1900, '2024-01-01'),
	('DE', 'reduced', 0.0700, '2024-01-01'),
	('AT', 'standard', 0.2000, '2024-01-01'),
	('AT', 'reduced', 0.1000, '2024-01-01'),
	('NL', 'standard', 0.2100, '2024-01-01'),
	('NL', 'reduced', 0.0900, '2024-01-01'),
	('FR', 'standard', 0.2000, '2024-01-01'),
	('FR', 'reduced', 0.0550, '2024-01-01')
ON CONFLICT DO NOTHING;

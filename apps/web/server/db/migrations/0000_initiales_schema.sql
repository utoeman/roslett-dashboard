CREATE TYPE "public"."buchungsart" AS ENUM('wareneingang', 'verkauf', 'retoure', 'korrektur', 'inventur', 'schwund');--> statement-breakpoint
CREATE TYPE "public"."buchungsquelle" AS ENUM('manuell', 'etsy', 'korrektur');--> statement-breakpoint
CREATE TYPE "public"."kostenposition_art" AS ENUM('fix', 'prozent');--> statement-breakpoint
CREATE TYPE "public"."preisregel" AS ENUM('gleiche_marge', 'fest');--> statement-breakpoint
CREATE TYPE "public"."verteilmethode" AS ENUM('wert', 'stueckzahl');--> statement-breakpoint
CREATE TABLE "bestandsbuchungen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variante_id" uuid NOT NULL,
	"art" "buchungsart" NOT NULL,
	"menge" integer NOT NULL,
	"gebucht_am" timestamp with time zone DEFAULT now() NOT NULL,
	"notiz" text,
	"quelle" "buchungsquelle" DEFAULT 'manuell' NOT NULL,
	"externe_referenz" text,
	"storniert_von_id" uuid
);
--> statement-breakpoint
CREATE TABLE "chargen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variante_id" uuid NOT NULL,
	"lieferant_id" uuid,
	"wareneingang_am" timestamp with time zone DEFAULT now() NOT NULL,
	"menge_eingang" integer NOT NULL,
	"menge_rest" integer NOT NULL,
	"einkaufspreis_fremd" numeric(14, 4) NOT NULL,
	"waehrung" text DEFAULT 'EUR' NOT NULL,
	"wechselkurs" numeric(14, 6) DEFAULT '1.000000' NOT NULL,
	"einkaufspreis_eur" numeric(14, 4) NOT NULL,
	"nebenkosten_eur" numeric(14, 4) DEFAULT '0' NOT NULL,
	"einstandspreis_eur" numeric(14, 4) NOT NULL,
	"notiz" text
);
--> statement-breakpoint
CREATE TABLE "chargenzuordnungen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buchung_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"menge" integer NOT NULL,
	"einstandspreis_eur" numeric(14, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanaele" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"gebuehr_prozent" numeric(6, 4) DEFAULT '0' NOT NULL,
	"gebuehr_fix" numeric(14, 4) DEFAULT '0' NOT NULL,
	"preisregel" "preisregel" DEFAULT 'gleiche_marge' NOT NULL,
	"aktiv" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanalpreise" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variante_id" uuid NOT NULL,
	"kanal_id" uuid NOT NULL,
	"vorgeschlagener_preis" numeric(14, 4),
	"gelisteter_preis" numeric(14, 4),
	"aktualisiert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kostenpositionen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variante_id" uuid,
	"bezeichnung" text NOT NULL,
	"art" "kostenposition_art" NOT NULL,
	"wert" numeric(14, 4) NOT NULL,
	"vorsteuerabzugsfaehig" boolean DEFAULT false NOT NULL,
	"aktiv" boolean DEFAULT true NOT NULL,
	"verteilmethode" "verteilmethode" DEFAULT 'wert' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lieferanten" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"land" text,
	"notiz" text,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "produkte" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"beschreibung" text,
	"kategorie" text,
	"archiviert_am" timestamp with time zone,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "varianten" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"produkt_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"bezeichnung" text NOT NULL,
	"mindestbestand" integer DEFAULT 0 NOT NULL,
	"basispreis_netto" numeric(14, 4),
	"ust_satz" numeric(5, 4) DEFAULT '0.1900' NOT NULL,
	"archiviert_am" timestamp with time zone,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bestandsbuchungen" ADD CONSTRAINT "bestandsbuchungen_variante_id_varianten_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."varianten"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chargen" ADD CONSTRAINT "chargen_variante_id_varianten_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."varianten"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chargen" ADD CONSTRAINT "chargen_lieferant_id_lieferanten_id_fk" FOREIGN KEY ("lieferant_id") REFERENCES "public"."lieferanten"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chargenzuordnungen" ADD CONSTRAINT "chargenzuordnungen_buchung_id_bestandsbuchungen_id_fk" FOREIGN KEY ("buchung_id") REFERENCES "public"."bestandsbuchungen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chargenzuordnungen" ADD CONSTRAINT "chargenzuordnungen_charge_id_chargen_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."chargen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanalpreise" ADD CONSTRAINT "kanalpreise_variante_id_varianten_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."varianten"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanalpreise" ADD CONSTRAINT "kanalpreise_kanal_id_kanaele_id_fk" FOREIGN KEY ("kanal_id") REFERENCES "public"."kanaele"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kostenpositionen" ADD CONSTRAINT "kostenpositionen_variante_id_varianten_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."varianten"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "varianten" ADD CONSTRAINT "varianten_produkt_id_produkte_id_fk" FOREIGN KEY ("produkt_id") REFERENCES "public"."produkte"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buchungen_variante_idx" ON "bestandsbuchungen" USING btree ("variante_id","gebucht_am");--> statement-breakpoint
CREATE UNIQUE INDEX "buchungen_externe_referenz_idx" ON "bestandsbuchungen" USING btree ("externe_referenz") WHERE "bestandsbuchungen"."externe_referenz" is not null;--> statement-breakpoint
CREATE INDEX "chargen_fifo_idx" ON "chargen" USING btree ("variante_id","wareneingang_am");--> statement-breakpoint
CREATE INDEX "chargenzuordnungen_buchung_idx" ON "chargenzuordnungen" USING btree ("buchung_id");--> statement-breakpoint
CREATE INDEX "chargenzuordnungen_charge_idx" ON "chargenzuordnungen" USING btree ("charge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kanalpreise_variante_kanal_idx" ON "kanalpreise" USING btree ("variante_id","kanal_id");--> statement-breakpoint
CREATE INDEX "kostenpositionen_variante_idx" ON "kostenpositionen" USING btree ("variante_id");--> statement-breakpoint
CREATE UNIQUE INDEX "varianten_sku_idx" ON "varianten" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "varianten_produkt_idx" ON "varianten" USING btree ("produkt_id");
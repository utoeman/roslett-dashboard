/**
 * Drizzle-Schema.
 *
 * Grundsaetze:
 * - Primaerschluessel sind UUIDs, erzeugt von der Datenbank.
 * - Geloescht wird nichts. Stattdessen setzt `archiviert_am` einen Zeitstempel.
 * - Geldbetraege liegen als NUMERIC(14,4) vor. Die vier Nachkommastellen
 *   nehmen Zwischenwerte auf, ohne dass gerundet werden muss; die Anwendung
 *   rechnet trotzdem durchgaengig in ganzzahligen Cent und wandelt nur an der
 *   Systemgrenze um (Regel 1).
 * - Der Bestand ist kein Feld. Er ergibt sich aus dem Buchungsjournal (Regel 8).
 */

import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Gemeinsame Bausteine
// ---------------------------------------------------------------------------

/** Geldspalte. NUMERIC statt double precision, weil Fliesskomma bei Geld ausfaellt. */
const geld = (name: string) => numeric(name, { precision: 14, scale: 4 });

const erstelltAm = timestamp('erstellt_am', { withTimezone: true })
  .notNull()
  .defaultNow();

// ---------------------------------------------------------------------------
// Aufzaehlungen
// ---------------------------------------------------------------------------

export const kostenpositionArtEnum = pgEnum('kostenposition_art', [
  'fix',
  'prozent',
]);

/** Verteilmethode fuer Nebenkosten einer Sendung (Regel 7). */
export const verteilmethodeEnum = pgEnum('verteilmethode', [
  'wert',
  'stueckzahl',
]);

export const preisregelEnum = pgEnum('preisregel', ['gleiche_marge', 'fest']);

export const buchungsartEnum = pgEnum('buchungsart', [
  'wareneingang',
  'verkauf',
  'retoure',
  'korrektur',
  'inventur',
  'schwund',
]);

/**
 * Herkunft einer Buchung. Wird in Phase 1 angelegt, aber noch nicht verwendet;
 * die Etsy-Anbindung ist ausdruecklich nicht Teil dieses Projekts.
 */
export const buchungsquelleEnum = pgEnum('buchungsquelle', [
  'manuell',
  'etsy',
  'korrektur',
]);

// ---------------------------------------------------------------------------
// Stammdaten
// ---------------------------------------------------------------------------

export const produkte = pgTable('produkte', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  beschreibung: text('beschreibung'),
  kategorie: text('kategorie'),
  archiviertAm: timestamp('archiviert_am', { withTimezone: true }),
  erstelltAm,
});

/**
 * Varianten.
 *
 * Auch ein Produkt ohne echte Varianten bekommt genau eine Standardvariante.
 * Das haelt jede nachgelagerte Abfrage frei von Sonderfaellen: Chargen,
 * Buchungen und Preise haengen ausnahmslos an einer Variante, nie an einem Produkt.
 */
export const varianten = pgTable(
  'varianten',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    produktId: uuid('produkt_id')
      .notNull()
      .references(() => produkte.id),
    sku: text('sku').notNull(),
    bezeichnung: text('bezeichnung').notNull(),
    mindestbestand: integer('mindestbestand').notNull().default(0),
    basispreisNetto: geld('basispreis_netto'),
    /** Umsatzsteuersatz zur Information. Beruehrt die Kalkulation nicht (Regel 2). */
    ustSatz: numeric('ust_satz', { precision: 5, scale: 4 })
      .notNull()
      .default('0.1900'),
    archiviertAm: timestamp('archiviert_am', { withTimezone: true }),
    erstelltAm,
  },
  (t) => [
    uniqueIndex('varianten_sku_idx').on(t.sku),
    index('varianten_produkt_idx').on(t.produktId),
  ],
);

export const lieferanten = pgTable('lieferanten', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  land: text('land'),
  notiz: text('notiz'),
  /**
   * Geloescht wird nicht. Ein Lieferant, mit dem nicht mehr gearbeitet wird,
   * bekommt hier einen Zeitstempel und verschwindet aus den Auswahllisten.
   * Seine Chargen bleiben unangetastet, sonst ginge die Historie verloren.
   */
  archiviertAm: timestamp('archiviert_am', { withTimezone: true }),
  erstelltAm,
});

// ---------------------------------------------------------------------------
// Wareneingang
// ---------------------------------------------------------------------------

/**
 * Chargen.
 *
 * Fremdwaehrung: Betrag, Waehrungscode und Wechselkurs werden gespeichert und
 * der Euro-Betrag daneben persistiert (Regel 6). Der Kurs friert beim
 * Wareneingang ein; zur Anzeigezeit wird nie umgerechnet, sonst wuerde sich
 * der Wareneinsatz vergangener Perioden mit jedem Kursstand aendern.
 *
 * `nebenkosten_eur` und `einstandspreis_eur` sind festgeschriebene Ergebnisse
 * der Verteilung, keine berechneten Felder (Regel 7).
 *
 * `menge_rest` ist die einzige Ausnahme von Regel 8: es ist kein Bestandsfeld,
 * sondern der FIFO-Zeiger dieser Charge. Der Bestand einer Variante ergibt sich
 * weiterhin allein aus dem Journal.
 */
export const chargen = pgTable(
  'chargen',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    varianteId: uuid('variante_id')
      .notNull()
      .references(() => varianten.id),
    lieferantId: uuid('lieferant_id').references(() => lieferanten.id),
    wareneingangAm: timestamp('wareneingang_am', { withTimezone: true })
      .notNull()
      .defaultNow(),
    mengeEingang: integer('menge_eingang').notNull(),
    mengeRest: integer('menge_rest').notNull(),
    einkaufspreisFremd: geld('einkaufspreis_fremd').notNull(),
    /** ISO-4217-Code. Bei Einkauf in Euro schlicht "EUR" mit Kurs 1. */
    waehrung: text('waehrung').notNull().default('EUR'),
    wechselkurs: numeric('wechselkurs', { precision: 14, scale: 6 })
      .notNull()
      .default('1.000000'),
    einkaufspreisEur: geld('einkaufspreis_eur').notNull(),
    nebenkostenEur: geld('nebenkosten_eur').notNull().default('0'),
    einstandspreisEur: geld('einstandspreis_eur').notNull(),
    notiz: text('notiz'),
  },
  (t) => [
    // Deckt die FIFO-Abfrage ab: Chargen einer Variante mit Restmenge,
    // aelteste zuerst.
    index('chargen_fifo_idx').on(t.varianteId, t.wareneingangAm),
  ],
);

// ---------------------------------------------------------------------------
// Kalkulation
// ---------------------------------------------------------------------------

/**
 * Kostenpositionen.
 *
 * `variante_id` null bedeutet: gilt global. `vorsteuerabzugsfaehig` steuert,
 * ob die Position in die Selbstkosten eingeht (Regel 3): Einfuhrumsatzsteuer
 * bleibt draussen, Zoll geht hinein.
 *
 * `verteilmethode` ergaenzt das urspruengliche Datenmodell. Regel 7 verlangt,
 * dass die Methode pro Kostenposition umschaltbar ist; ohne eigene Spalte
 * liesse sich diese Einstellung nicht speichern.
 */
export const kostenpositionen = pgTable(
  'kostenpositionen',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    varianteId: uuid('variante_id').references(() => varianten.id),
    bezeichnung: text('bezeichnung').notNull(),
    art: kostenpositionArtEnum('art').notNull(),
    /** Bei art "fix" ein Betrag, bei "prozent" ein Satz (0.1900 = 19 %). */
    wert: geld('wert').notNull(),
    vorsteuerabzugsfaehig: boolean('vorsteuerabzugsfaehig')
      .notNull()
      .default(false),
    aktiv: boolean('aktiv').notNull().default(true),
    verteilmethode: verteilmethodeEnum('verteilmethode')
      .notNull()
      .default('wert'),
  },
  (t) => [index('kostenpositionen_variante_idx').on(t.varianteId)],
);

export const kanaele = pgTable('kanaele', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  /** Prozentuale Gebuehr auf den Verkaufspreis, 0.0650 = 6,5 %. */
  gebuehrProzent: numeric('gebuehr_prozent', { precision: 6, scale: 4 })
    .notNull()
    .default('0'),
  gebuehrFix: geld('gebuehr_fix').notNull().default('0'),
  preisregel: preisregelEnum('preisregel').notNull().default('gleiche_marge'),
  aktiv: boolean('aktiv').notNull().default(true),
});

export const kanalpreise = pgTable(
  'kanalpreise',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    varianteId: uuid('variante_id')
      .notNull()
      .references(() => varianten.id),
    kanalId: uuid('kanal_id')
      .notNull()
      .references(() => kanaele.id),
    /** Ergebnis der Rueckwaertsrechnung (Regel 5). */
    vorgeschlagenerPreis: geld('vorgeschlagener_preis'),
    /** Was tatsaechlich im Shop steht. Weicht bewusst ab, wenn der Nutzer es so will. */
    gelisteterPreis: geld('gelisteter_preis'),
    aktualisiertAm: timestamp('aktualisiert_am', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('kanalpreise_variante_kanal_idx').on(t.varianteId, t.kanalId),
  ],
);

// ---------------------------------------------------------------------------
// Bestandsjournal
// ---------------------------------------------------------------------------

/**
 * Bestandsbuchungen. Das Journal ist die einzige Wahrheit ueber den Bestand
 * (Regel 8); `menge` ist vorzeichenbehaftet, Abgaenge sind negativ.
 *
 * Storniert wird nicht durch Loeschen, sondern durch eine Gegenbuchung, die
 * ueber `storniert_von_id` auf das Original zeigt. So bleibt die Historie
 * vollstaendig nachvollziehbar.
 *
 * `quelle` und `externe_referenz` werden angelegt, aber in diesem Projekt
 * nicht verwendet. Die eindeutige Bedingung auf `externe_referenz` verhindert
 * spaeter doppelte Importe derselben Bestellung.
 */
export const bestandsbuchungen = pgTable(
  'bestandsbuchungen',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    varianteId: uuid('variante_id')
      .notNull()
      .references(() => varianten.id),
    art: buchungsartEnum('art').notNull(),
    menge: integer('menge').notNull(),
    gebuchtAm: timestamp('gebucht_am', { withTimezone: true })
      .notNull()
      .defaultNow(),
    notiz: text('notiz'),
    quelle: buchungsquelleEnum('quelle').notNull().default('manuell'),
    externeReferenz: text('externe_referenz'),
    stornoVonId: uuid('storniert_von_id'),
  },
  (t) => [
    index('buchungen_variante_idx').on(t.varianteId, t.gebuchtAm),
    // Partieller eindeutiger Index: mehrere Buchungen ohne externe Referenz
    // sind erlaubt, dieselbe Referenz zweimal aber nicht.
    uniqueIndex('buchungen_externe_referenz_idx')
      .on(t.externeReferenz)
      .where(sql`${t.externeReferenz} is not null`),
  ],
);

/**
 * Chargenzuordnungen.
 *
 * Die FIFO-Zuordnung wird persistiert, nicht bei Bedarf neu berechnet
 * (Regel 9). Der Grund: eine Retoure muss exakt in die Charge zurueckbuchen,
 * aus der die Ware stammt. Wuerde man die Zuordnung nachtraeglich neu
 * herleiten, verschoebe jede spaetere Buchung das Ergebnis rueckwirkend.
 *
 * `einstandspreis_eur` wird mitgeschrieben, obwohl er in der Charge steht:
 * so bleibt der Wareneinsatz des Vorgangs auch dann unveraendert, wenn die
 * Charge spaeter korrigiert wird.
 */
export const chargenzuordnungen = pgTable(
  'chargenzuordnungen',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buchungId: uuid('buchung_id')
      .notNull()
      .references(() => bestandsbuchungen.id),
    chargeId: uuid('charge_id')
      .notNull()
      .references(() => chargen.id),
    menge: integer('menge').notNull(),
    einstandspreisEur: geld('einstandspreis_eur').notNull(),
  },
  (t) => [
    index('chargenzuordnungen_buchung_idx').on(t.buchungId),
    index('chargenzuordnungen_charge_idx').on(t.chargeId),
  ],
);

// ---------------------------------------------------------------------------
// Beziehungen
// ---------------------------------------------------------------------------

export const produkteRelations = relations(produkte, ({ many }) => ({
  varianten: many(varianten),
}));

export const variantenRelations = relations(varianten, ({ one, many }) => ({
  produkt: one(produkte, {
    fields: [varianten.produktId],
    references: [produkte.id],
  }),
  chargen: many(chargen),
  buchungen: many(bestandsbuchungen),
  kostenpositionen: many(kostenpositionen),
  kanalpreise: many(kanalpreise),
}));

export const lieferantenRelations = relations(lieferanten, ({ many }) => ({
  chargen: many(chargen),
}));

export const chargenRelations = relations(chargen, ({ one, many }) => ({
  variante: one(varianten, {
    fields: [chargen.varianteId],
    references: [varianten.id],
  }),
  lieferant: one(lieferanten, {
    fields: [chargen.lieferantId],
    references: [lieferanten.id],
  }),
  zuordnungen: many(chargenzuordnungen),
}));

export const kanaeleRelations = relations(kanaele, ({ many }) => ({
  kanalpreise: many(kanalpreise),
}));

export const kanalpreiseRelations = relations(kanalpreise, ({ one }) => ({
  variante: one(varianten, {
    fields: [kanalpreise.varianteId],
    references: [varianten.id],
  }),
  kanal: one(kanaele, {
    fields: [kanalpreise.kanalId],
    references: [kanaele.id],
  }),
}));

export const kostenpositionenRelations = relations(
  kostenpositionen,
  ({ one }) => ({
    variante: one(varianten, {
      fields: [kostenpositionen.varianteId],
      references: [varianten.id],
    }),
  }),
);

export const bestandsbuchungenRelations = relations(
  bestandsbuchungen,
  ({ one, many }) => ({
    variante: one(varianten, {
      fields: [bestandsbuchungen.varianteId],
      references: [varianten.id],
    }),
    storniertVon: one(bestandsbuchungen, {
      fields: [bestandsbuchungen.stornoVonId],
      references: [bestandsbuchungen.id],
      relationName: 'storno',
    }),
    zuordnungen: many(chargenzuordnungen),
  }),
);

export const chargenzuordnungenRelations = relations(
  chargenzuordnungen,
  ({ one }) => ({
    buchung: one(bestandsbuchungen, {
      fields: [chargenzuordnungen.buchungId],
      references: [bestandsbuchungen.id],
    }),
    charge: one(chargen, {
      fields: [chargenzuordnungen.chargeId],
      references: [chargen.id],
    }),
  }),
);

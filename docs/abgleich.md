# Abgleich Fachkonzept ↔ Code

Grundlage: Fachkonzept (`domain-model.md`, `screens.md`, Stand 17.10.2026) gegen
`apps/web/server/db/schema.ts` (Stand Phase 2).

Grundregel: **Fachlich entscheidet das Fachkonzept, technisch der Code.** Code bleibt englisch.
Umsetzung erst nach Abschluss aller Schritte, mit Plan und Freigabe.

## Schritt 1: Stammdaten (entschieden 17.10.2026)

| Punkt | Entscheidung |
|---|---|
| Verkaufspreis | Basis-VK **brutto am Produkt**, Variante kann optional einen eigenen Preis haben |
| Kategorie | Kürzel-Liste (KIS, DCK, TLF, GTS, DEC, VAS, KRZ), in den Einstellungen pflegbar; jedes Kürzel gehört zur Gruppe Textil oder Deko |
| Merkmale | Farbe (aus Kürzel-Liste) und Größe als eigene Felder; Variantenname wird daraus gebildet |
| SKU | wird automatisch erzeugt nach `ROS-{KAT}-{PRODNR}-{FARBE}-{GROESSE}`, danach nie änderbar |
| MwSt | MwSt-Kategorie am Produkt (normal/ermäßigt), Sätze je Lieferland in eigener Tabelle; ersetzt `vat_rate` an der Variante |
| Aktiv/Archiv | `archived_at` bleibt; Variante archivieren nur bei Bestand 0 |
| Mindestbestand | bleibt (`minimum_stock`) |
| Etsy-IDs | kommen mit dem Etsy-Schritt, nicht jetzt |

## Schritt 2: Lieferant, Wareneingang, Charge, Nebenkosten (entschieden 17.10.2026)

| Punkt | Entscheidung |
|---|---|
| Lieferant | + Standardwährung (Vorbelegung im Wareneingang) |
| Wareneingang | neuer Beleg-Kopf: Lieferant, Rechnungsnr., Rechnungsdatum, Währung, Kurs, Status |
| Charge | Position eines Wareneingangs mit bestellter Menge; gelieferte Menge = Summe der Zugangsbuchungen |
| Teillieferung | mehrere Zugänge pro Charge; Status (offen/teilgeliefert/vollständig) wird berechnet |
| Wechselkurs | EZB-Referenzkurs am Rechnungsdatum automatisch; manuelle Eingabe als Ausweg |
| FIFO-Reihenfolge | nach Rechnungsdatum |
| Nebenkosten | eigene Tabelle am Wareneingang (Fracht, Zoll, Sonstiges, Gutschrift), nachträglich erfassbar |
| Einstand | wird berechnet, nicht eingefroren; nachträgliche Kosten wirken rückwirkend (E6), Absicherung über Monatsabschluss (E7). `batch_allocations` speichert nur noch Charge + Menge |
| Einfuhrumsatzsteuer | bleibt außerhalb des Einstands, Zoll gehört hinein |
| Verteilung | Umschaltung Wert/Stück bleibt, Standard „nach Warenwert“ |
| `cost_items` | Kalkulationskosten (z. B. Verpackung) → Schritt 4 |

## Schritt 3: Bestandsjournal (entschieden 17.10.2026)

| Punkt | Entscheidung |
|---|---|
| Buchungstypen | 8 Typen wie im Fachkonzept: `goods_receipt`, `sale`, `return`, `shrinkage`, `own_use`, `stocktake`, `supplier_return`, `reversal` (ersetzt `correction`) |
| Storno-Verweis | neue Buchung zeigt auf Original (`reverses_id`); Original bleibt unverändert (E4) |
| Fehlmenge | Abgang ohne Bestand wird mit Warnung gebucht, Rest ohne Charge; nächster Zugang oder Inventur ordnet automatisch zu (E8) |
| Retoure | zurück auf ursprüngliche Charge(n) – wie bisher |
| Inventur | Plus → neueste Charge, Minus → FIFO |
| Notiz | Pflicht bei Schwund, Eigenverbrauch, Inventur |
| Datum | fachliches Datum (`posted_at`) + technisches (`created_at`) |
| Verkaufsbezug | Verweis auf Verkaufsposition; Bestellnummer liegt am Verkauf |
| `quantity_remaining` | entfällt; Restmenge der Charge = Summe ihrer Zuordnungen |

## Schritt 4: Kanäle, Preise, Gebühren, Versand (entschieden 17.10.2026)

| Punkt | Entscheidung |
|---|---|
| Preis je Kanal | **ein Preis überall**; Marge wird je Kanal getrennt angezeigt. `channel_prices` und `pricing_rule` entfallen |
| Kanalgebühr | % + fix pro Kanal – wie bisher |
| Versand | + Versandpreis brutto und „versandkostenfrei ab“ pro Kanal |
| Gebühr pro Verkauf | eigene Tabelle; MVP pauschal aus Kanal, später exakt aus Etsy-API → Schritt 5 |
| Kostenpositionen | bleiben (Verpackung, Etiketten …) und gehen in **jede** Marge ein: Selbstkosten = Einstand + Stückkosten |
| Kalkulator | bleibt: Zielmarge → Vorschlag Basis-VK brutto, gerechnet mit dem teuersten Kanal |
| Netto, Marge ≠ Aufschlag | bleibt |

## Schritt 5: Verkauf (entschieden 17.10.2026)

| Punkt | Entscheidung |
|---|---|
| Verkauf | Kanal, Bestellnr. (eindeutig je Kanal), Datum, Lieferland, Versanderlös brutto, Porto, Rabatt brutto, Status offen/versendet/storniert |
| Position | Variante, Menge, VK brutto/Stück, MwSt-Satz (automatisch aus Lieferland + MwSt-Kategorie, gespeichert) |
| Gebühr | eigene Tabelle je Verkauf (Typ, Betrag, Quelle pauschal/api); Pauschale = % auf **Bestellsumme brutto inkl. Versand** + fix |
| Porto | neues Feld Standardporto am Kanal, pro Bestellung überschreibbar |
| Erfassung | Shop manuell im MVP; Etsy-Import später (M3), Tabellen vorbereitet |
| Retoure-Status | wird aus Buchungen abgeleitet |
| Verteilung | Rabatt, Versanderlös, Porto, Gebühren anteilig nach Warenwert auf Positionen |
| Marge je Position | VK netto − Wareneinsatz (FIFO) − Stückkosten − Gebühren − Porto + Versanderlös netto − Rabatt netto |

## Schritt 6: Monatsabschluss (entschieden 17.10.2026)

| Punkt | Entscheidung |
|---|---|
| Auslöser | manuell per Button (E16) |
| Inhalt | Snapshot je Variante: Umsatz, Wareneinsatz, Marge, Lagerwert |
| Sperre | kein Storno in abgeschlossenen Monaten |
| Spätere Änderungen | abgeschlossener Monat bleibt unverändert; Differenz erscheint im laufenden Monat als „Korrektur Vormonate“ (E7) |
| Wieder öffnen | **nie** |

## Schritt 7: Screens & Design (entschieden 17.10.2026)

| Punkt | Entscheidung |
|---|---|
| Navigation | Übersicht · Produkte · Wareneingang · Verkäufe · Bestandsjournal · Einstellungen |
| Benennung | „Produkte“ statt „Artikel“ (Route `/produkte`) |
| Produktdetail | Tabs Varianten / Chargen / Journal + Seitenleiste „Marge eines Verkaufs“ |
| Einstellungen | Kanäle, Lieferanten, Kostenpositionen, SKU-Kürzel, MwSt-Sätze, Monatsabschlüsse |
| Wareneingang mobil | eigener Screen (390 px); PWA erst M4 |
| Formulare | Nuxt UI-Formular + Zod (kein VeeValidate) |
| Design-Tokens | laut `design.md`: Leinengrau `#F3F0EA`, Oliv `#4A5A34`, Sand `#C9A27A`, Instrument Sans, IBM Plex Mono (`tabular-nums`); Terrakotta + Inter entfallen |
| Komponenten | Nuxt UI als Basis + eigene, dokumentierte Fachbausteine (Geldfeld, SKU-Badge, Buchungstyp-Badge, Mengen-Stepper, KPI-Kachel) |

## Schritt 8: Plan, Werkzeuge, Betrieb (entschieden 17.10.2026)

| Punkt | Entscheidung |
|---|---|
| Zeitplan | Roadmap M1–M4 in `roadmap.md`; Phase 1–2 gelten als erledigt |
| Paketmanager | **npm** (Workspaces) bleibt; Pläne werden korrigiert |
| Betrieb | **Netlify + Neon** (zunächst Vercel geplant); Docker nur für die lokale DB |
| CI | GitHub Actions (Lint, Typecheck, Tests) – wird ergänzt |

## Schritt 9: Shopify-Spezifikation ↔ Ist-Stand (im Interview entschieden 25.10.2026)

Grundlage: `roslett-dashboard-spezifikation.md` (Stand 24.10.2026), übernommen und angepasst
als [shopify-integration.md](shopify-integration.md). Bei Widerspruch gilt diese Tabelle.

| # | Punkt | Spezifikation | Entscheidung |
|---|---|---|---|
| A1 | SKU-Schema | `KH-LINA-4545-NAT`, „noch festzulegen“ | bleibt `ROS-{KAT}-{PRODNR}-{FARBE}-{GROESSE}` (E15); Produktnummer statt Name, damit Umbenennen die SKU nicht entwertet |
| A2 | Schlüssel | `sku` als Primärschlüssel | `uuid` bleibt Primärschlüssel, `sku` eindeutig und unveränderlich |
| A3 | Wechselkurs | Zollwert-Kurs | bleibt EZB-Referenzkurs am Rechnungsdatum (Schritt 2); Zoll wird als Euro-Betrag aus dem Zollbescheid erfasst |
| A4 | Etsy, Amazon | nur über Shopify (Sync-Apps) | **übernommen**: keine direkte Etsy-/Amazon-Anbindung; Etsy-IDs und Etsy-API-Gebühren entfallen, Gebühren pauschal je Kanal |
| A5 | Mengenhoheit | Shopify besitzt die Bestandsmenge | **übernommen ab Shopify-Anbindung**; das Journal bleibt Wertgrundlage (FIFO), Mengen kommen aus Shopify-Bestellungen bzw. werden relativ gepusht. Bis dahin bleibt das Dashboard Master |
| A6 | Preis je Kanal | ein Preis, kalkuliert auf den teuersten Kanal | deckt sich mit Schritt 4; `channel_prices` und `pricing_rule` entfallen weiterhin (im Schema noch vorhanden) |
| A7 | MwSt | fest `/ 1.19` | Satz aus `vat_rates` (Lieferland + MwSt-Kategorie), je Position gespeichert (E12) |
| A8 | Shop-Plattform | Shopify | **Shopify**; Projekt-`CLAUDE.md` angepasst |
| A9 | Hosting | Hetzner CAX31 + Ploi | bleibt **Netlify + Neon** (Schritt 8, läuft); Webhooks als Netlify Function, nächtlicher Abgleich als Scheduled Function. Wechsel nur bei echtem Bedarf |
| A10 | Wareneinsatz | „historisch fix“ | bleibt rückwirkend bis zum Monatsabschluss (E6), danach „Korrektur Vormonate“ (E7) – erfüllt dasselbe Ziel |
| A11 | Geldformat | `NUMERIC(10,4)` | bleibt wie im Code: Rechnen in ganzzahligen Cent (E14), Speichern als `NUMERIC(14,4)` |

Lücken der Spezifikation:

| # | Punkt | Entscheidung |
|---|---|---|
| B1 | Mengenabweichung im Abgleich | Prüfliste mit Vorschlag (Inventur: Plus → neueste Charge, Minus → FIFO), Buchung per Klick mit Notiz |
| B2 | Verkauf ohne passende Charge | wird gebucht, Warnung; nächster Zugang ordnet zu (E8) |
| B3 | Erstattung ohne Wiedereinlagerung | nur Erlös mindern, keine Bestandsbuchung; Wareneinsatz bleibt als Retourenverlust |
| B4 | Storno, Bestelländerung | werden mit abgerufen (`reversal` bzw. Positionsabgleich) |
| B6 | Änderung eines Dashboard-Felds in Shopify | Warnung „in Shopify geändert“, nächster Push (mit Vorschau) überschreibt |
| B7 | Einstandspreis-Push | gewichteter Durchschnitt offener Chargen; nach jedem Wareneingang und nächtlich für geänderte Varianten |
| B8 | Einfuhrumsatzsteuer | Info-Feld am Wareneingang, nicht im Einstand |
| B9 | Unbekannte Bestellquelle | wird gebucht, Kanal leer, Warnung; Zuordnung in den Einstellungen, Gebühren danach nachgerechnet |
| B10 | Zugang nach Shopify | per Klick mit Vorschau (`+Menge`, relativ), vorgezogen in Stufe 2 |

Recht (Grundlage: Erkenntnisse RA Croon, 24.10.2026):

| # | Punkt | Entscheidung |
|---|---|---|
| C1/C2 | Herstellerangaben | Roslett ist Quasi-Herstellerin (eigene Marke): **einmal zentral** in den Einstellungen (Name, ladungsfähige Geschäftsadresse, E-Mail); keine Lieferanten- oder Einführer-Felder |
| C3 | Kennung auf dem Etikett | SKU als Artikelnummer |
| C4 | Kundendaten | werden nicht gespeichert; Bestelldaten sofort auf Nummer, Datum, Lieferland, Positionen, Beträge gekürzt |
| C5 | Faserzusammensetzung | an der Variante, bis zu zwei Teile („Faser“, optional „Faser Füllung“) |
| C6 | Eigenfertigung | Ware kommt gemischt (Zukauf und Eigenfertigung). Neuer Beleg-Typ **Produktion** wie Wareneingang: Menge je Variante, Kosten Stoff, Nählohn, Zubehör, Fracht, Zoll; Verteilung und FIFO wie bisher. Kein Stofflager. Wird **vor** der Shopify-Anbindung gebaut |
| C7 | Pflicht-Unterlagen (Prüfberichte, Risikoanalyse, Beschwerden) | später, nicht im Dashboard bis auf Weiteres |
| C8 | Absatzgebiet | ganze EU ab Start; Dashboard pflegt Pflichttexte nur auf Deutsch, Übersetzungen in Shopify; OSS mit Steuerberatung klären |

Umsetzung:

| # | Punkt | Entscheidung |
|---|---|---|
| D1 | Abruf in Stufe 1 | Polling alle 15 Minuten (Scheduled Function) + Button „Jetzt abrufen“; Webhooks ab Stufe 2 |
| D2 | Entwicklung | gegen einen Shopify Development Store |
| D3 | Echter Shop | noch nicht angelegt |
| D4 | Erstimport | ab Anbindung, keine Altbestellungen |
| D5 | Erstanlage der Produkte | CSV-Export im Shopify-Format aus dem Dashboard |

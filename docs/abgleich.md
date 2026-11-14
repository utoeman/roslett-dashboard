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
| D2 | Entwicklung | gegen einen Shopify Development Store (`roslett-dev.myshopify.com`, Tarif Basic, ohne Testdaten und Feature-Preview; angelegt 26.10.2026) |
| D3 | Echter Shop | angelegt (Testphase), bleibt bis zum Start unberührt |

## Schritt 10: Verkaufsmodell, Shopify Stufe 1a (entschieden 26.10.2026)

Drei PRs: 1a-1 Datenmodell und Kern, 1a-2 Oberfläche, 1a-3 Erstattung, Retoure, Storno.
Release nach 1a-3.

| # | Punkt | Entscheidung |
|---|---|---|
| F1 | Manuelle Erfassung | ja: Bestellung von Hand erfassen (Test ohne Shopify, Verkäufe außerhalb von Shopify) |
| F2 | Erstattungen | eigene Tabelle `refunds` (Verkauf, Position optional, Menge, Betrag brutto, Wiedereinlagerung, Datum); kommt mit 1a-3 |
| F3 | Kanal am Verkauf | optional (B9); in der manuellen Erfassung Pflicht. Zuordnung Shopify-Quelle → Kanal kommt mit 1b |
| F4 | Lieferland ohne MwSt-Satz | manuelle Erfassung lehnt ab; Import (1b) bucht mit Warnung |
| F5 | `channel_prices`, `pricing_rule` | bleiben vorerst im Schema, Aufräumen in einem eigenen PR |
| F6 | Monatssperre | noch nicht geprüft; kommt mit dem Monatsabschluss |
| F7 | Bestellsumme für die Pauschalgebühr | Warenwert brutto − Rabatt brutto + Versanderlös brutto |
| F8 | Porto, Gebühren | gelten als Nettokosten; Rabatt und Versanderlös werden mit dem MwSt-Satz der jeweiligen Position auf netto gerechnet |
| F9 | Versanderlös und Porto | Vorbelegung aus dem Kanal (versandkostenfrei ab Warenwert brutto), je Bestellung überschreibbar |
| F10 | Storno | nur offene Bestellungen, immer die ganze Bestellung, nur ohne Erstattungen; danach läuft alles über Retoure/Erstattung (entschieden 28.10.2026) |
| F11 | Gebühren bei Erstattung und Storno | bleiben voll stehen (konservativ, bis exakte Gebühren aus der API kommen); ein Storno zeigt deshalb Marge = − Gebühren, ohne Erlös, Porto und Stückkosten |
| F12 | Retoure beschädigt | Häkchen im Retoure-Dialog: Retoure auf die Chargen der Position + Schwund (FIFO) in einem Schritt; der Verlust bleibt in der Marge |
| F13 | Retoure auf Chargen | zuerst schließt sie eine noch offene Fehlmenge der Position, dann zurück auf die Chargen der Position, neueste zuerst |
| F14 | Verkaufsbuchungen im Journal | lassen sich dort nicht stornieren; nur über den Verkauf (Storno, Retoure) |
| D4 | Erstimport | ab Anbindung, keine Altbestellungen |
| D5 | Erstanlage der Produkte | CSV-Export im Shopify-Format aus dem Dashboard |

## Schritt 11: Anbindung, Shopify Stufe 1b (entschieden 31.10.2026)

Zwei PRs: 1b-1 Zugang und SKU-Zuordnung (nur lesen), 1b-2 Abruf von Bestellungen,
Erstattungen und Stornos. Release nach 1b-2.

| # | Punkt | Entscheidung |
|---|---|---|
| G1 | Wo Produkte entstehen | im Dashboard (bestätigt D5 und Feldhoheit); nach Shopify per CSV-Export, ab Stufe 3 per API. In Shopify werden nur Fotos, SEO-Texte und Kollektionen gepflegt |
| G2 | Produktbilder | Upload im Dashboard, ab Stufe 3: der Browser lädt direkt zu Shopify hoch (Staged Upload), das Dashboard hängt das Bild ans Produkt und speichert nur die Shopify-Verknüpfung, keine Bilddatei. Reihenfolge und Alt-Texte bleiben in Shopify (Invariante 4) |
| G3 | Zugang | eigene App im Shopify Dev Dashboard, Client-Credentials-Grant: Client-ID und -Secret als Umgebungsvariablen, Token (24 h) holt der Server bei Bedarf. Geht nur für Stores derselben Organisation |
| G4 | Berechtigungen | alle Scopes für Stufe 1–3 gleich bei der Einrichtung (`read_products`, `write_products`, `read_inventory`, `write_inventory`, `read_orders`, `read_locations`, `write_files`), damit nicht je Stufe neu installiert werden muss; geschrieben wird erst ab Stufe 2 |
| G5 | Zuordnung | über die SKU. Shopify-IDs (Produkt, Variante, Inventarartikel) werden an Produkt bzw. Variante gespeichert; Varianten ohne Treffer und Shopify-Varianten ohne Dashboard-SKU erscheinen in einer Liste |
| G6 | Bestand in 1b-1 | wird nur angezeigt (Shopify-Menge neben Dashboard-Menge), nicht gebucht; Abweichungen landen ab 1b-2 in der Prüfliste |
| G7 | Storno aus Shopify | Shopify legt beim Stornieren automatisch eine Erstattung aller Positionen an (`restockType` `CANCEL`). Hat die Bestellung `cancelledAt`, wird sie als Storno gebucht (F10, `reversal`); diese Erstattung gehört dazu und wird nicht zusätzlich gebucht (entschieden 31.10.2026) |
| G8 | Status beim Import | „versendet“ nur, wenn Shopify die Bestellung als ausgeführt meldet (`FULFILLED`), sonst „offen“ |
| G9 | Gebühren beim Import | weiter pauschal aus dem Kanal (F11); echte Zahlungsgebühren aus der API später |
| G10 | Abruf in 1b-2 | zunächst nur per Button „Jetzt abrufen“; der 15-Minuten-Abruf (D1) folgt nach einer Woche Testbetrieb. Erstattungen mit `restockType` `RETURN` oder `CANCEL` gelten als wieder eingelagert (V2) |
| G11 | Testbetrieb | entfällt (entschieden 31.10.2026): der 15-Minuten-Abruf und der nächtliche Abgleich kommen sofort als Schritt 1c; G10 „nach einer Woche“ ist damit überholt |
| G12 | Webhooks | vorerst **keine** (entschieden 31.10.2026): Abruf alle 15 Minuten plus nächtlicher Abgleich der letzten 48 Stunden reicht beim erwarteten Volumen; Webhooks nur bei echtem Bedarf. Ergänzt D1 und Stufe 2 |
| G13 | Umfang bis Go-live | Shopify-Stufen 1c–4; übrige Roadmap-Punkte (Diagramme, PWA, Playwright, Barrierefreiheit, Demo) nach dem Go-live. Direkt vor dem Go-live werden Testprodukte samt aller Bewegungen gelöscht, Stammdaten bleiben |
| G14 | Lagerort für Zugänge | gibt es in Shopify genau einen aktiven Lagerort, wird er automatisch genommen; bei mehreren Hinweis mit Auswahl (entschieden 31.10.2026) |
| G15 | Einstandspreis-Push | nur per Klick nach Vorschau, zusammen mit dem Verkaufspreis; kein automatischer Push nach Wareneingang oder nachts (ersetzt die Taktung in Abschnitt 6 der Shopify-Anbindung) |
| G16 | Zugang nach Shopify | jede Zugangsbuchung genau einmal, relativ (`+Menge`); Teillieferungen eines Belegs werden einzeln übertragen, stornierte Zugänge nicht. Korrekturen danach über Inventur/Schwund (Stufe 4) |
| G17 | Status neuer Produkte (Stufe 3) | Entwurf; veröffentlicht wird in Shopify, wenn Fotos, SEO-Texte und Kollektionen gepflegt sind. Bei vorhandenen Produkten ändert das Dashboard den Status nicht (entschieden 31.10.2026) |
| G18 | Änderungen im Shopify-Admin an Dashboard-Feldern | die Vorschau zeigt Shopify- und Dashboard-Wert je Feld; das Dashboard überschreibt erst nach Klick. Keine eigene Warnung „in Shopify geändert“ |
| G19 | Archivierte Produkte | werden in Shopify archiviert, nie gelöscht. `productSet` ersetzt die Variantenliste: archivierte oder fremde Varianten entfernt Shopify, die Vorschau nennt sie vorher |
| G20 | CSV-Export | bleibt, bis die Übertragung per API im Dev-Store bestätigt ist; danach in einem eigenen PR entfernt |
| G21 | Bestandsänderungen nach Shopify (Stufe 4) | gesammelt auf der Seite „Shopify“ mit Vorschau, ein Klick überträgt alles; nicht sofort beim Buchen (entschieden 31.10.2026) |
| G22 | Was übertragen wird | Zugang, Schwund, Eigenverbrauch, Inventur, Rückgabe an Lieferant – relativ, je Buchung einmal; ein Storno nur, wenn die stornierte Buchung übertragen war. Verkäufe, Retouren und deren Stornos nie (kommen aus Shopify). Wareneingänge erscheinen zusätzlich zum Button am Beleg |
| G23 | Ab wann | nur Buchungen ab Stufe 4; ältere Schwund-, Inventur-, Eigenverbrauchs-, Rückgabe- und Storno-Buchungen werden bei der Migration als „vor Stufe 4“ vermerkt, nicht übertragen |
| G24 | „Angleichen“ aus der Prüfliste | wird beim Buchen als „angeglichen“ vermerkt und nie übertragen, weil die Zählung schon Shopifys Menge ist |
| G25 | Löschen von Stammdaten | Kategorien, Farben und Produktvarianten lassen sich löschen, wenn sie **archiviert und nie verwendet** sind (Kategorie ohne Produkte, Farbe ohne Varianten, Variante ohne Buchung, Wareneingang und Verkauf); sonst bleiben sie archiviert. Die letzte Variante eines Produkts bleibt; stattdessen wird das archivierte **Produkt als Ganzes** gelöscht (gleiche Regel für alle Varianten). Ein Produkt in Shopify bleibt dort bestehen. Kanalpreise und eigene Kostenpositionen einer Variante gehen mit (entschieden 31.10.2026) |
| G26 | Kürzel-Vorschlag | beim Anlegen von Farben und Kategorien schlägt das Dashboard das Kürzel aus dem Namen vor (erste drei Buchstaben, Umlaute ersetzt; belegt → weitere Buchstaben des Namens), von Hand überschreibbar |
| G27 | Gewicht, Shopify-Kategorie, Alt-Texte | Variante hat ein Versandgewicht in Gramm (→ `measurement.weight`, leer = 0); Dashboard-Kategorie bekommt die Shopify-Standardkategorie per Suche (→ `category`); Bilder erhalten beim Hochladen den Alt-Text „Produktname, Farbe“, in Shopify änderbar (entschieden 31.10.2026, Prüfung der Testanlage) |
| G28 | Testdaten-Reset vor dem Go-live | Workflow „Testdaten löschen“ (Probelauf als Standard, Löschen nur mit Eingabe „LÖSCHEN“): löscht in einer Transaktion alle Produkte, Varianten, Wareneingänge, Buchungen, Verkäufe und variantenbezogenen Einstellungen; Stammdaten, allgemeine Kostenpositionen und Abrufstand bleiben; Produktnummern beginnen wieder bei 0001. Vorher Neon-Sicherungszweig anlegen (entschieden 31.10.2026) |
| G29 | Wareneingang-Entwürfe löschen | Entwürfe (noch nichts gebucht) lassen sich samt Positionen und Nebenkosten endgültig löschen; gebuchte Wareneingänge bleiben und werden im Bestandsjournal storniert. Nummern laufen als max()+1: wird der neueste Entwurf gelöscht, bekommt der nächste Eingang dieselbe Nummer, sonst bleibt eine Lücke – ein Entwurf ist noch kein Beleg. Status wird in der Transaktion mit Zeilensperre geprüft; ein paralleles Buchen ergibt 409 (entschieden 01.11.2026) |
| G30 | Lieferanten löschen | Wie Farben und Kategorien (G25): nur archivierte Lieferanten, die in keinem Wareneingang und keiner Produktion stehen; sonst bleiben sie archiviert (entschieden 01.11.2026) |
| G31 | Preis nach dem Wareneingang | Der Verkaufspreis wird erst festgelegt, wenn der Einstand bekannt ist: kein Preisfeld beim Anlegen von Produkt und Variante, Kennzeichen „Preis fehlt“, Übertragung nach Shopify erst mit Preis. Nach „Zugang buchen“ zeigt der Wareneingang „Preise festlegen“: je Produkt Einstand der Lieferung plus Kostenpositionen, Vorschlag aus einer Zielmarge (Feld, Standard 40 %, nicht gespeichert) und Marge je aktivem Kanal **nach Pauschalgebühr**. Gebühr wie beim Verkauf auf den Bruttopreis (E10), Versand bleibt außen vor. Der Vorschlag erfüllt die Zielmarge auf **jedem** aktiven Kanal (teuerster Kanal bestimmt) und wird auf ,90 aufgerundet; ohne Kanal gilt die Marge vor Gebühren. Gespeichert wird am Produkt, abweichende Farben an der Variante (entschieden 13.11.2026) |
| G32 | Gebuchten Wareneingang löschen | Für falsch erfasste Eingänge: Löschen samt Positionen, Nebenkosten, Zugangsbuchungen und deren Stornos – bewusste Ausnahme von E4. Nur erlaubt, solange keine andere Buchung (Verkauf, Retoure, Inventur, Schwund …) die Chargen nutzt, auch keine stornierte; sonst Korrektur per Gutschrift oder Storno. Bestätigung durch Eingabe der Belegnummer. War der Zugang an Shopify übertragen, läuft zuerst der Bestellabruf (meldet er Fehler oder bringt er einen Verkauf aus diesen Chargen, wird nichts gelöscht). Dann wird die übertragene Menge als eigener Schritt relativ wieder abgezogen (Grund `correction`) und der Übertragungsvermerk entfernt – der Zugang gilt danach als „nicht übertragen“, auch wenn das Löschen selbst noch scheitert; ein zweiter Versuch zieht deshalb nichts doppelt ab. Abgelehnt wird, wenn Shopify weniger Bestand führt als abzuziehen wäre. Erst danach löscht die Datenbank, mit gesperrten Chargen. Varianten ohne Shopify-Verknüpfung werden übersprungen und in der Vorschau genannt. Nummernvergabe wie G29 (max()+1) (entschieden 13.11.2026, Ablauf präzisiert 14.11.2026) |

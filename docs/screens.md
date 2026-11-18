# Screens

Entwürfe aller Kern-Screens, entstanden vor der Umsetzung. Den umgesetzten Stand zeigen die Screenshots im [README](../README.md#screenshots). Alle Desktop-Screens sind fluide Seiten (Seitennavigation links, auf schmalen Bildschirmen umbrechend). Alle Zahlen sind **Demodaten**, aber in sich stimmig.

Durchgehendes Beispiel: Variante `ROS-KIS-0012-SAN-4545` (Leinenkissen Sand 45×45) hat eine **Fehlmenge von −1** nach Etsy #3318; sie wird beim Buchen von **WE-2026-014** aufgelöst.

Gemeinsame Navigation: Übersicht · Produkte · Wareneingang · Verkäufe · Bestandsjournal · Einstellungen.

## Übersicht
- **Zweck:** Monatsüberblick und Handlungsbedarf.
- **Kopf:** „Oktober 2026 · offen“, Zeitraum-Auswahl, Button „Monat abschließen“.
- **Warnbanner:** 2 Etsy-Verkäufe ohne Bestand (SKUs genannt), Link „Wareneingang erfassen“.
- **KPI-Kacheln:** Lagerwert zu Einstandspreisen (8.420 €, 1.146 Stück, 64 Varianten), Umsatz netto Oktober (3.180 €; Shop 1.840 €, Etsy 1.340 €), Marge Oktober (1.240 €, 39 %), offene Fehlmengen (2).
- **Diagramm:** Umsatz netto nach Kanal (Shop/Etsy), Mai–Oktober, gruppierte Balken.
- **Marge nach Produkt:** Top 5 mit Betrag, Prozent und Balken.
- **Nachbestellen:** Varianten unter Mindestbestand (SKU, Produkt, Bestand, Mindest).
- **Letzte Buchungen:** Datum, Typ-Badge, SKU, Menge; Link zum Journal.

## Produktliste
- **Zweck:** alle Produkte finden und Zustand erkennen.
- **Filter:** Suche (Name/SKU), Kategorie (Alle/Textil/Deko), Bestand (Alle/Unter Mindestbestand/Fehlmenge/Ausverkauft), Checkbox „Nur aktive“; Button „Neues Produkt“.
- **Tabelle:** Produkt + SKU-Stamm, Kategorie, Varianten, Bestand (mit Badge Fehlmenge / unter Mindest), Basis-VK brutto, Ø Einstand, Marge, Etsy-Verknüpfung („x von y verknüpft“ / „nicht auf Etsy“).
- **Hinweis:** Marge hier = Basis-VK netto − Ø Einstand (FIFO), vor Gebühren und Versand.
- **Ablauf:** Klick auf Produkt → Produktdetail.

## Produktdetail
- **Kopf:** Leinenkissen Sand, `ROS-KIS-0012`, Textil, Basis-VK 39,90 € brutto, MwSt. normal, 86 Stück; Buttons „Bearbeiten“, „Variante hinzufügen“.
- **Tabs (interaktiv):**
  - *Varianten (4):* SKU, Größe, Bestand, Mindest, Lagerwert, Etsy-Variante; Fehlmengen-Zeile hervorgehoben.
  - *Chargen:* Variantenauswahl; Wareneingang, Datum, Lieferant, Menge, Rest, Einstand/Stk, Status (aufgebraucht / Fehlmenge / als Nächstes). Hinweis, dass die Fehlmenge beim Buchen von WE-2026-014 zugeordnet wird.
  - *Journal:* Datum, Typ, Beleg, Charge, Menge, laufender Bestand; Hinweis auf Unveränderlichkeit; Link ins globale Journal.
- **Seitenleiste „Marge eines Verkaufs“ (Etsy #3291):** VK netto 33,53 € (39,90 € brutto, 19 %) − Wareneinsatz 9,48 € (FIFO WE-2026-012) − Gebühren Etsy 4,49 € (pauschal) − Porto 4,95 € + Versanderlös netto 4,12 € = **18,73 € · 56 %**.

Journal-Beispiel 45×45 (rückwärts): Zugang +40 → 40 · Eigenverbrauch −2 → 38 · 11 Bestellungen −34 → 4 · Retoure +1 → 5 · Etsy #3291 −1 → 4 · Shop #1044 −3 → 1 · Etsy #3318 −2 → −1 (davon 1 aus WE-2026-012, 1 Fehlmenge).

## Wareneingang Desktop
- **Zweck:** Lieferantenrechnung mit Positionen und Nebenkosten erfassen.
- **Kopf:** WE-2026-014 · Entwurf; Buttons „Als Entwurf speichern“, „Zugang buchen“.
- **Rechnung:** Lieferant (Lino Tekstil, TR), Rechnungsnummer, Rechnungsdatum, Währung (TRY/EUR/USD); Wechselkurs-Zeile „1 EUR = 47,85 TRY, EZB-Referenzkurs vom Rechnungsdatum, automatisch abgerufen“.
- **Positionen:** Variante + SKU, Menge (Eingabe), EK netto TRY (Eingabe), EK netto EUR, Nebenkosten/Stk, Einstand/Stk; Button „Position hinzufügen (SKU suchen oder scannen)“.
  - 45×45: 40 × 380 TRY → 7,94 € + 1,37 € = 9,31 €
  - 50×50: 30 × 410 TRY → 8,57 € + 1,48 € = 10,05 €
  - 60×60: 20 × 470 TRY → 9,82 € + 1,70 € = 11,52 €
  - Tischläufer 40×150: 30 × 420 TRY → 8,78 € + 1,52 € = 10,30 €
- **Nebenkosten:** Fracht 96,00 €, Zoll 82,76 €, „Weitere Kosten oder Gutschrift“; Hinweis auf rückwirkende Anpassung.
- **Zusammenfassung:** 4 Positionen · 120 Stück, Warenwert 1.034,50 €, Nebenkosten 178,76 €, Einstand gesamt 1.213,26 €; Hinweis auf Zuordnung der Fehlmenge; Checkbox Teillieferung.

## Wareneingang Handy (390 × 844)
- **Zweck:** Lieferung im Lager prüfen, Teillieferung buchen.
- **Kopf:** Zurück-Link, WE-2026-014 · Lino Tekstil, Fortschrittsbalken „Geliefert x von 120“.
- **Button:** „SKU-Etikett scannen“.
- **Positionskarten (interaktiv):** Name, SKU, Status-Badge (vollständig / offen n / Mehrlieferung), bestellt, Plus/Minus-Stepper.
- **Fuß:** Hinweis „Teillieferung: n Stück bleiben offen“, Button „x Stück als Teillieferung buchen“ bzw. „Zugang buchen“. Startzustand: Tischläufer 18 von 30.

## Verkäufe & Etsy-Import
- **Kopf:** Oktober 2026 · 41 Bestellungen; Buttons „Shop-Bestellung erfassen“ (Shop im MVP manuell), „Etsy jetzt abrufen“.
- **Letzter Etsy-Import:** 3 neu gebucht, 1 übersprungen (bereits importiert), 1 mit Fehlmenge; Duplikaterkennung über Etsy-Bestellnummer; Abruf alle 30 Minuten.
- **Nicht zugeordnet:** Etsy-Variante ohne SKU (Tischläufer 40×200) – Bestellungen werden erst nach Verknüpfung gebucht.
- **Filter:** Suche (Bestellnummer/SKU), Kanal, Status (Offen/Versendet/Retoure/Storniert/Fehlmenge).
- **Tabelle:** Datum, Kanal, Bestellung, Land (DE/AT/NL/FR), Stück, Umsatz brutto, Marge (vorläufig bei Fehlmenge, „—“ bei Storno), Status (Fehlmenge/Offen/Versendet/Teilretoure/Storniert).

## Bestandsjournal
- **Kopf:** „Alle Bestandsbewegungen · unveränderlich“; Buchungsart (Schwund / Eigenverbrauch / Inventurkorrektur / Rückgabe an Lieferant) + „Buchung erfassen“.
- **Hinweis:** abgeschlossen bis September 2026; dort kein Storno, Korrekturen im laufenden Monat.
- **Filter:** SKU oder Beleg, Typ, Zeitraum, „Nur Fehlmengen“.
- **Tabelle:** Nr., Datum, Typ, SKU, Charge, Menge, Beleg/Notiz, Aktion „Stornieren“ bzw. „abgeschlossen“.
- **Beispiele:** Verkauf aufgeteilt auf Charge + Fehlmenge; Teillieferung 24 von 30; Retoure auf ursprüngliche Charge; Storno-Paar (#2058 Schwund −3 durchgestrichen, #2060 Storno +3, #2061 korrekter Schwund −1); Rückgabe an Lieferant (Webfehler); Inventur (gezählt 46, Soll 48); gesperrte Buchung aus September.

## Einstellungen
- **Verkaufskanäle:** je Kanal Gebühr %, Fix pro Bestellung, Versandpreis brutto, versandkostenfrei ab.
  - Eigener Shop (manuelle Erfassung): 1,5 % + 0,25 €, Versand 4,90 €, frei ab 50,00 €
  - Etsy · [DEIN ETSY-SHOP] (verbunden): 10,5 % + 0,30 €, Versand 4,90 €, frei ab 50,00 €
  - Alles Beispielwerte, mit aktuellen Konditionen abgleichen.
- **SKU-Schema:** `ROS-{Kategorie}-{Produktnr.}-{Farbe}-{Größe}`; Kategorie-Kürzel KIS Kissen, DCK Decke, TLF Tischläufer, GTS Geschirrtuch-Set, DEC Deko allgemein/Körbe, VAS Vase, KRZ Kerze; Farb-Kürzel SAN Sand, OLI Olive, NAT Natur, TER Terrakotta, STR Streifen, FEI Feige.
- **MwSt.-Sätze nach Lieferland:** DE 19/7 %, AT 20/10 %, NL 21/9 %, FR 20/5,5 % (Gültig-ab im Ausland „[PRÜFEN]“); Hinweis OSS/Etsy mit Steuerberatung klären.
- **Monatsabschlüsse:** Juli–September abgeschlossen, Oktober offen mit 1 Korrektur Vormonate; Button „Oktober 2026 abschließen“.

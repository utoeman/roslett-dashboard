# Shopify-Anbindung

Stand 25.10.2026. Übernommen aus `roslett-dashboard-spezifikation.md` (24.10.2026) und an den
Ist-Stand angepasst; Abweichungen und Gründe in [abgleich.md](abgleich.md), Schritt 9.
Fachliche Regeln (FIFO, Marge, Monatsabschluss) stehen in [domain-model.md](domain-model.md)
und werden hier nicht wiederholt.

## 1. Ziel

Roslett verkauft über den eigenen Shopify-Shop, Etsy, Amazon und Instagram. Etsy und Amazon
laufen über Sync-Apps in Shopify ein; Shopify ist damit der einzige Punkt, an dem alle
Verkäufe sichtbar sind.

Shopify kennt pro Variante nur ein Feld „Kosten pro Artikel“. Das Dashboard übernimmt, was
Shopify nicht kann: Einkauf in Fremdwährung, Landed Cost, FIFO, Marge je Kanal,
Preisrechner. **Nicht Ziel:** Checkout, Kundenverwaltung, Bestellabwicklung, Versand,
Rechnungen (bleibt Shopify bzw. Lexware Office).

## 2. Invarianten

1. **Shopify besitzt die Mengenwahrheit, das Dashboard die Wertwahrheit.**
2. **Bestände werden nur relativ gebucht** (`+40`, `-2`), nie absolut gesetzt.
   `inventorySetQuantities` wird nicht verwendet.
3. **Bei Mengenabweichung gewinnt Shopify.** Der nächtliche Abgleich korrigiert das Dashboard.
4. **Pro Feld genau eine Schreibrichtung**, keine Zwei-Wege-Synchronisation.
5. **Die SKU ist der Schlüssel über alle Systeme**: `ROS-{KAT}-{PRODNR}-{FARBE}-{GROESSE}`,
   z. B. `ROS-KIS-0012-SAN-4545` (E15). Unveränderlich, nie wiederverwendet.

## 3. Feldhoheit

| Daten | Master | Richtung |
|---|---|---|
| Produkte, Varianten, SKU, Beschreibung | Dashboard | Push → Shopify |
| Verkaufspreis (ein Preis für alle Kanäle) | Dashboard | Push → Shopify |
| Einstandspreis („Kosten pro Artikel“) | Dashboard | Push → Shopify |
| GPSR- und Textilangaben (Metafelder) | Dashboard | Push → Shopify |
| Bestandsmenge | **Shopify** | Pull |
| Bestellungen aller Kanäle | **Shopify** | Pull |
| Retouren, Erstattungen, Stornos | **Shopify** | Pull |
| Chargen, Fremdwährung, Kurse, Zoll, Fracht, FIFO | Dashboard | nur Dashboard |
| Kanalgebühren, Versand, Kostenpositionen | Dashboard | nur Dashboard |
| Bilder hinzufügen | Dashboard | Upload → Shopify (ab Stufe 3, G2) |
| Bildreihenfolge, Alt-Texte, SEO-Texte, Kollektionen | Shopify | kein Push |

## 4. Vorgänge

Buchungstypen sind die vorhandenen aus `stock_entry_kind` (Schritt 3 im Abgleich).

### V1 Verkauf (Shopify → Dashboard)
1. Webhook `orders/create`.
2. Kanal bestimmen (Abschnitt 5), Verkauf und Positionen anlegen, Lieferland und MwSt-Satz
   je Position speichern.
3. Pro Position `sale`-Buchung, FIFO-Zuordnung wie im Domain-Modell; Fehlmenge mit Warnung (E8).
4. Gebühren pauschal aus dem Kanal, Versand, Rabatt und Porto anteilig nach Warenwert (Schritt 5).

### V2 Retoure, Erstattung, Storno (Shopify → Dashboard)
- `refunds/create` mit Wiedereinlagerung (`restockType` = `RETURN` oder `CANCEL`):
  `return`-Buchung auf genau die Chargen der ursprünglichen Position.
- Erstattung **ohne** Wiedereinlagerung (`NO_RESTOCK`): keine Bestandsbuchung, nur der Erlös
  sinkt. Wareneinsatz bleibt als Retourenverlust in der Marge.
- Reine Geld-Erstattung (Kulanz, Teilbetrag): nur Erlös anpassen.
- `orders/cancelled` vor Versand: Verkauf auf `storniert`, `reversal` der `sale`-Buchungen.
- `orders/edited`: Positionen abgleichen, Differenzen als `sale` bzw. `reversal`.

### V3 Wareneingang, Produktion (Dashboard → Shopify)
1. Erfassung als Wareneingang (Zukauf) oder Produktion (Eigenfertigung: Stoff, Nählohn,
   Zubehör, Fracht, Zoll); Verteilung auf Stückkosten und FIFO wie bisher.
2. Nach dem Buchen: Button „Nach Shopify übertragen“ mit Vorschau
   (z. B. `ROS-KIS-0012-SAN-4545: +40, Shopify 12 → 52`), nach Bestätigung
   `inventoryAdjustQuantities` mit `+Menge`, Name `available`.
3. Einstandspreis-Push siehe Abschnitt 6.

### V4 Neues Produkt, neuer Preis (Dashboard → Shopify)
1. Änderung markiert den Datensatz als „nicht übertragen“.
2. „Nach Shopify übertragen“ zeigt zuerst eine **Vorschau** (alt → neu, pro Feld).
3. Nach Bestätigung: Upsert von Produkt, Varianten, SKU, Preis, Kosten, Metafeldern.
4. Shopify-IDs (`product`, `variant`, `inventoryItem`) speichern, Zeitpunkt und Prüfsumme
   des Pushs setzen.

### V5 Inventur, Schwund (Dashboard → Shopify)
1. `stocktake` bzw. `shrinkage` wie im Domain-Modell (Plus → neueste Charge, Minus → FIFO,
   Notiz Pflicht).
2. Differenz relativ pushen (`-2`).

## 5. Kanal-Erkennung

Shopify liefert pro Bestellung die Quelle (`sourceName`, App bzw. Vertriebskanal). In den
Einstellungen wird eine Zuordnung Quelle → Dashboard-Kanal gepflegt:

| Shopify-Quelle (Beispiel) | Kanal |
|---|---|
| Online Store (`web`) | Shop |
| Etsy-Sync-App | Etsy |
| Marketplace Connect (Amazon) | Amazon |
| Instagram/Facebook-Kanal | Instagram |

Unbekannte Quelle: Bestellung wird gebucht, Kanal leer, Warnung in der Übersicht.
Konkrete Werte nach Einrichtung der Apps an echten Bestellungen ablesen.

## 6. Einstandspreis-Push

Gepusht wird der **gewichtete Durchschnitt der offenen Chargen** je Variante (Methode fest,
nicht wechseln). Der Wert ändert sich mit jedem Verkauf und jeder Nachbelastung; deshalb:
nach jedem Wareneingang sofort, sonst einmal nächtlich für alle Varianten, deren Wert sich
geändert hat. Shopify nutzt das Feld nur für eigene Berichte; maßgeblich bleibt das Dashboard.

## 7. Technik

- **API:** GraphQL Admin API, eigene App im Shopify Dev Dashboard (G3). Zugang über den
  Client-Credentials-Grant: `POST https://{shop}/admin/oauth/access_token` mit Client-ID und
  -Secret liefert einen Token für 24 Stunden; der Server holt ihn bei Bedarf neu. Geht nur
  für Stores derselben Shopify-Organisation. Umgebungsvariablen: `NUXT_SHOPIFY_SHOP`,
  `NUXT_SHOPIFY_CLIENT_ID`, `NUXT_SHOPIFY_CLIENT_SECRET`.
- **Scopes (G4):** `read_products`, `write_products`, `read_inventory`, `write_inventory`,
  `read_orders`, `read_locations`, `write_files` – alle gleich bei der Einrichtung.
  Bestellungen setzen Zugriff auf *protected customer data* voraus (in der App beantragen).
- **Mutationen** (gegen die aktuelle API-Version prüfen): `productSet`,
  `productVariantsBulkUpdate`, `inventoryItemUpdate` (Kosten), `inventoryAdjustQuantities`,
  `metafieldsSet`. Massenänderungen über Bulk Operations.
- **Abruf in Stufe 1:** Polling alle 15 Minuten (Scheduled Function) und Button
  „Jetzt abrufen“: Bestellungen, Erstattungen, Stornos seit dem letzten Abruf, idempotent
  über die Shopify-ID. Import ab Anbindung, keine Altbestellungen (kein `read_all_orders`).
- **Webhooks ab Stufe 2:** `orders/create`, `orders/updated`, `orders/cancelled`, `orders/edited`,
  `refunds/create`, `inventory_levels/update`, `products/update`.
- **Webhook-Verarbeitung** (Netlify Function): HMAC prüfen, Event mit `X-Shopify-Event-Id`
  persistieren (eindeutig → Idempotenz), dann direkt verarbeiten und mit 200 antworten.
  Fehler werden am Event vermerkt und vom nächtlichen Lauf erneut versucht. Shopify erwartet
  die Antwort innerhalb weniger Sekunden.
- **Echo eigener Änderungen:**
  - `inventory_levels/update` bucht **nie** Bestand; es löst nur einen Mengenvergleich für
    die Variante aus. Bestand bewegen nur Bestellungen, Erstattungen und eigene Pushes.
  - `products/update`: Prüfsumme der Dashboard-Felder mit dem letzten Push vergleichen.
    Gleich → eigenes Echo, ignorieren. Abweichend → manuelle Änderung im Shopify-Admin,
    Warnung „in Shopify geändert“; der nächste Push überschreibt nach Vorschau.
- **Nächtlicher Abgleich** (Scheduled Function): Bestellungen des Vortags nachholen
  (fehlende Webhooks), Bestände vergleichen. Mengenabweichung → Eintrag in einer Prüfliste
  mit Vorschlag (`stocktake`: Plus → neueste Charge, Minus → FIFO); gebucht wird erst per
  Klick mit Notiz. Der Abgleich ist Pflicht, nicht Komfort.
- **Wartung:** API-Version mindestens jährlich hochziehen.
- **Secrets:** Zugangsdaten und Webhook-Secret nur als Umgebungsvariablen in Netlify.

## 8. GPSR- und Textilangaben

Grundlage: Erkenntnisse RA Croon (Telefonat und E-Mail, 24.10.2026). Unter der eigenen Marke
ist Roslett **Quasi-Herstellerin**; die Fabrik und Einführer-Angaben gehören nicht aufs Etikett.

| Angabe | Ebene | Inhalt |
|---|---|---|
| Hersteller | Einstellungen, einmal | Roslett, ladungsfähige Geschäftsadresse (keine Privatadresse), E-Mail |
| Faser | Variante | z. B. „100 % Baumwolle“, getrennt von anderen Angaben |
| Faser Füllung | Variante, optional | gefüllte Kissen/Decken: Bezug und Füllung getrennt, außer fest vernäht |
| Kennung | Variante | die SKU als Artikelnummer |
| Pflege- und Sicherheitshinweise | Produkt | gehören auf die Verpackung |
| Herkunftsland, HS-Code | Variante | Zoll, Marktplätze |

Pflichttexte pflegt das Dashboard auf Deutsch; Übersetzungen für andere EU-Länder in Shopify.
Etikett angenäht, Etiketten möglichst schon in der Türkei anbringen. Kein CE-Zeichen.
Prüfberichte, Risikoanalyse und Beschwerdeverzeichnis (10 Jahre) vorerst außerhalb des Dashboards.

## 9. Datenschutz

- Webhook-Payloads enthalten Kundendaten. Nach erfolgreicher Verarbeitung werden sie auf die
  benötigten Felder gekürzt; das Dashboard speichert keine Namen, Adressen oder E-Mails.
- Verzeichnis der Verarbeitungstätigkeiten, Löschkonzept, AV-Vertrag mit Shopify und Neon.

## 10. Ausbaustufen

| Stufe | Inhalt | Risiko |
|---|---|---|
| 0 | Vorarbeiten ohne Shopify-Zugriff: Produktion (Eigenfertigung), Herstellerangaben, Faserfelder, CSV-Export im Shopify-Format für die Erstanlage | keins |
| 1 | Nur lesen (Polling): Bestellungen, Erstattungen, Stornos, Bestände; FIFO, Marge, Prüfliste | keins |
| 2 | Schreiben per Klick mit Vorschau: Verkaufspreis, Einstandspreis, Zugänge (`+Menge`); Webhooks | gering bis mittel |
| 3 | Schreiben: Produkte, Varianten, Metafelder (Upsert); Bild-Upload (G2) | mittel (Pflichtangaben) |
| 4 | Inventur- und Schwundbuchungen relativ pushen | mittel |

Bis Stufe 3 steht, werden Produkte per CSV aus dem Dashboard angelegt bzw. aktualisiert.

**CSV-Export (Stufe 0, umgesetzt):** Produktliste → „Shopify-CSV“. Eine Zeile je aktiver
Variante, Produktangaben nur in der ersten Zeile; Status `draft`, nicht veröffentlicht.
Handle = Name + Produktnummer (`leinenkissen-sand-0012`). Optionen „Farbe“ und „Größe“
(fehlender Wert: „Standard“, ohne beide: Shopify-Standardvariante). Preis brutto, „Cost per
item“ = gewichteter Durchschnitt offener Chargen (Abschnitt 6). Produktmetafelder
`custom.fiber`, `custom.fiber_filling`, `custom.care_instructions`, `custom.safety_information`,
`custom.manufacturer` – in Shopify vorher als Metafelddefinitionen anlegen.
Grenzen des Shopify-CSV: **keine Variantenmetafelder** (Faser nur, wenn sie bei allen Varianten
gleich ist, sonst Hinweis), **kein HS-Code und kein Herkunftsland**, Bestandsmengen werden
bewusst nicht exportiert (würden absolut setzen, Invariante 2). Diese Werte kommen mit Stufe 3.

## 11. Nicht im Umfang

Bildbearbeitung und Galerie-Reihenfolge, absolutes Setzen von Beständen, direkte Etsy-/Amazon-Anbindung,
Zwei-Wege-Sync eines Feldes, Mehrbenutzer, Versand, Rechnungen.

## 12. Offen

- Startwerte für Retourenquote und Verpackungskosten (Preisrechner).
- Konkrete Kanalgebühren (Richtwerte Herbst 2026: Shopify Payments EU-Karte 2,1 % + 0,30 €;
  Etsy 6,5 % + 4 % + 0,30 € + 0,18 € Listing; Amazon ca. 15 %, Marketplace Connect + 1 % ab
  50 Bestellungen/Monat) – vor Inbetriebnahme prüfen.
- OSS und MwSt bei EU-Verkäufen mit Steuerberatung klären.
- Zollwert bei Eigenfertigung mit dem Zoll abstimmen (Transaktionswert).

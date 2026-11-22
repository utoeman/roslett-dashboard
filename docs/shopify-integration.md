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
| Bilder hinzufügen, Farbe zuordnen, löschen | Dashboard | Upload → Shopify (ab Stufe 3, G2); Farbe und Löschen nachträglich (G34) |
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

**Umgesetzt (2b, G14, G16):** Wareneingang › „Nach Shopify übertragen“ zeigt je Variante die noch
nicht übertragenen Zugangsbuchungen (Teillieferungen einzeln, stornierte ausgenommen) mit
`Shopify alt → neu`. Übertragen wird relativ mit `changeFromQuantity` (Shopify lehnt ab, wenn sich
der Bestand seit dem Lesen geändert hat) und `@idempotent`-Schlüssel aus den Buchungs-IDs. Jede
Buchung steht danach in `shopify_inventory_pushes` (eindeutig je Buchung, Journal bleibt
unverändert). Lagerort: der einzige aktive automatisch, sonst Auswahl.

### V4 Neues Produkt, neuer Preis (Dashboard → Shopify)
1. Änderung markiert den Datensatz als „nicht übertragen“.
2. „Nach Shopify übertragen“ zeigt zuerst eine **Vorschau** (alt → neu, pro Feld).
3. Nach Bestätigung: Upsert von Produkt, Varianten, SKU, Preis, Kosten, Metafeldern.
4. Shopify-IDs (`product`, `variant`, `inventoryItem`) speichern, Zeitpunkt und Prüfsumme
   des Pushs setzen.

**Umgesetzt (3a, G17–G19):** Produktseite › „Nach Shopify übertragen“. Ein `productSet` je
Produkt (synchron) mit Titel, Beschreibung, Marke (= Hersteller; ohne Herstellerangaben bleibt die
Shopify-Marke), Produkttyp (= Kategorie), Optionen Farbe/Größe, Varianten mit SKU und Preis,
Produktmetafeldern (`custom.fiber`, `fiber_filling`, `care_instructions`, `safety_information`,
`manufacturer`), Variantenmetafeldern `custom.fiber`/`fiber_filling` sowie HS-Code und
Herkunftsland am Inventarartikel (immer gesendet, leer = in Shopify gelöscht), Versandgewicht in Gramm
(`measurement.weight`, leer = 0) und die Shopify-Standardkategorie der Dashboard-Kategorie (`category`, G27). Handle und Status
„Entwurf“ nur beim Anlegen; ein unverknüpftes Produkt, dessen Handle es in Shopify schon gibt, wird
abgelehnt (erst verknüpfen). Einstandspreis bleibt bei 2a. Die Vorschau vergleicht Feld für Feld
mit Shopify und nennt Varianten, die Shopify entfernen würde. Prüfsumme ohne IDs, Handle und
Entwurfsstatus → „seit letzter Übertragung geändert“. Variantenmetafelder haben im Dev-Store noch
keine Definition (im Admin erst nach Anlage sichtbar).

**Umgesetzt (3b, G2):** Produktseite › „Bilder in Shopify“. Der Server prüft Typ (JPEG, PNG,
WebP, GIF) und Größe (≤ 20 MB) und holt ein Upload-Ziel (`stagedUploadsCreate`, Ressource `IMAGE`);
der Browser lädt die Datei direkt dorthin (CORS erlaubt, kein Netlify-Größenlimit); danach hängt
`productUpdate(product, media)` das Bild an. Angenommen werden nur Adressen von
`shopify-staged-uploads.storage.googleapis.com`. Das Dashboard speichert nichts außer der
vorhandenen Produktverknüpfung und liest die Bilder aus Shopify. `productSet` (3a) lässt Bilder
unberührt. Nur für Produkte, die schon in Shopify sind.
Optional wird beim Hochladen eine **Farbe** gewählt (Liste aus den Farben der aktiven Varianten):
das Bild wird Variantenbild aller Varianten dieser Farbe über alle Größen
(`productVariantAppendMedia`), sodass der Shop beim Farbwechsel das Bild wechselt. Shopify nimmt die
Zuordnung erst an, wenn das Bild verarbeitet ist („Non-ready media cannot be attached to variants“);
der Browser fragt deshalb bis zu 30 s alle 1,5 s nach statt den Server warten zu lassen
(Funktionslimit). Je Variante gibt es in Shopify genau ein Variantenbild. `productSet` lässt auch
diese Zuordnung stehen (geprüft).
**Umgesetzt (G34):** Klick auf ein Bild öffnet „Bild bearbeiten“. Farben (mehrere oder keine) setzen
das Bild als Variantenbild genau dieser Farben: `planVariantMedia` (core) bestimmt, welche Varianten
ihr altes Bild verlieren (`productVariantDetachMedia`) und welche dieses bekommen
(`productVariantAppendMedia`). „Löschen“ löscht das Bild per `fileDelete` endgültig in Shopify
(Scope `write_files`, G4), erst nach Bestätigung.

### V5 Inventur, Schwund (Dashboard → Shopify)
1. `stocktake` bzw. `shrinkage` wie im Domain-Modell (Plus → neueste Charge, Minus → FIFO,
   Notiz Pflicht).
2. Differenz relativ pushen (`-2`).

**Umgesetzt (Stufe 4, G21–G24):** Seite „Shopify“ › „Offene Bestandsänderungen“ listet je Variante
alle Buchungen, die Shopify nicht kennt (Zugang, Schwund, Eigenverbrauch, Inventur, Rückgabe an
Lieferant; Storno nur einer übertragenen Buchung), mit `Shopify alt → neu`. Übertragen wird je
Shopify-Grund (`received`, `shrinkage`, `cycle_count_available`, sonst `correction`) mit
`changeFromQuantity` und `@idempotent`; jede Buchung landet einmal in `shopify_inventory_pushes`
(Grund `pushed`, `aligned` für „Angleichen“, `before_stage4` für Altbuchungen). Dieselbe Logik
nutzt der Button am Wareneingang (2b).

## 5. Kanal-Erkennung

Shopify liefert pro Bestellung die Quelle (`sourceName`, App bzw. Vertriebskanal). In den
Einstellungen wird eine Zuordnung Quelle → Dashboard-Kanal gepflegt:

| Shopify-Quelle (Beispiel) | Kanal |
|---|---|
| Online Store (`web`) | Shop |
| Etsy-Sync-App | Etsy |
| Marketplace Connect (Amazon) | Amazon |
| Instagram/Facebook-Kanal | Instagram |

Unbekannte Quelle: Bestellung wird gebucht, Kanal leer, ohne Gebühren und Porto, Warnung im
Abrufergebnis. Gepflegt wird die Zuordnung am Kanal (Feld „Shopify-Quellen“, eine Quelle gehört
zu genau einem Kanal). Bekannte Werte: `web` (Onlineshop), `shopify_draft_order` (im Admin
angelegte Bestellung); weitere an echten Bestellungen ablesen.

## 6. Einstandspreis-Push

Gepusht wird der **gewichtete Durchschnitt der offenen Chargen** je Variante (Methode fest,
nicht wechseln). Der Wert ändert sich mit jedem Verkauf und jeder Nachbelastung; deshalb:
nach jedem Wareneingang sofort, sonst einmal nächtlich für alle Varianten, deren Wert sich
geändert hat. Shopify nutzt das Feld nur für eigene Berichte; maßgeblich bleibt das Dashboard.

**Umgesetzt (2a, G15):** Seite „Shopify“ › „Preise und Einstandspreise“ vergleicht alle verknüpften
Varianten (Preis = Variantenpreis, sonst Basispreis; Einstand wie oben) und zeigt nur Abweichungen.
„Änderungen übertragen“ schreibt Preise je Produkt (`productVariantsBulkUpdate`) und Kosten je
Inventarartikel (`inventoryItemUpdate`); die Vorschau wird serverseitig neu berechnet. Varianten
ohne Dashboard-Preis behalten ihren Shopify-Preis und werden gemeldet.

## 7. Technik

- **API:** GraphQL Admin API, eigene App im Shopify Dev Dashboard (G3). Zugang über den
  Client-Credentials-Grant: `POST https://{shop}/admin/oauth/access_token` mit Client-ID und
  -Secret liefert einen Token für 24 Stunden; der Server holt ihn bei Bedarf neu. Geht nur
  für Stores derselben Shopify-Organisation. Umgebungsvariablen: `NUXT_SHOPIFY_SHOP`,
  `NUXT_SHOPIFY_CLIENT_ID`, `NUXT_SHOPIFY_CLIENT_SECRET`.
- **Scopes (G4):** `read_products`, `write_products`, `read_inventory`, `write_inventory`,
  `read_orders`, `read_locations`, `write_files` – alle gleich bei der Einrichtung.
  Bestellungen gehen ohne Freigabe für *protected customer data*; gelesen wird vom Kunden nur
  das Lieferland (C4). Fehlt die Lieferadresse, gilt DE mit Warnung.
- **Mutationen** (gegen die aktuelle API-Version prüfen): `productSet`,
  `productVariantsBulkUpdate`, `inventoryItemUpdate` (Kosten), `inventoryAdjustQuantities`,
  `metafieldsSet`. Massenänderungen über Bulk Operations.
- **Abruf in Stufe 1:** Polling alle 15 Minuten (Scheduled Function) und Button
  „Jetzt abrufen“: Bestellungen, Erstattungen, Stornos seit dem letzten Abruf, idempotent
  über die Shopify-ID (Bestellung, Position, Erstattung). Eine Bestellung, die nicht gebucht
  werden kann (z. B. unbekannte SKU, Nummer schon von Hand erfasst), erscheint als Fehler und
  hält den Abrufstand an ihrer Änderungszeit fest, damit der nächste Abruf sie erneut versucht.
  Nachträgliche Positionsänderungen (`orders/edited`) gleicht der Abruf nicht ab. Import ab Anbindung, keine Altbestellungen (kein `read_all_orders`).
- **Automatischer Abruf (1c):** zwei Netlify Scheduled Functions rufen `POST /api/cron/shopify-sync`
  auf, geschützt mit `NUXT_CRON_SECRET` (statt Sitzung): alle 15 Minuten ab dem Abrufstand,
  nachts um 02:00 UTC die letzten 48 Stunden unabhängig vom Abrufstand. Ergebnis und Auslöser des
  letzten Laufs werden gespeichert und auf der Seite „Shopify“ angezeigt.
- **Webhooks (später, G12):** `orders/create`, `orders/updated`, `orders/cancelled`, `orders/edited`,
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
- **Nächtlicher Abgleich** (Scheduled Function): Bestellungen der letzten 48 Stunden nachholen
  (verpasste Läufe), Bestände vergleichen. Mengenabweichung → Eintrag in einer Prüfliste
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
| 0 | Vorarbeiten ohne Shopify-Zugriff: Produktion (Eigenfertigung), Herstellerangaben, Faserfelder, CSV-Export für die Erstanlage (mit 3a entfernt) | keins |
| 1 | Nur lesen (Polling): Bestellungen, Erstattungen, Stornos, Bestände; FIFO, Marge, Prüfliste | keins |
| 2 | Schreiben per Klick mit Vorschau: Verkaufspreis, Einstandspreis, Zugänge (`+Menge`); Webhooks erst bei Bedarf (G12) | gering bis mittel |
| 3 | Schreiben: Produkte, Varianten, Metafelder (Upsert); Bild-Upload (G2) | mittel (Pflichtangaben) |
| 4 | Inventur- und Schwundbuchungen relativ pushen | mittel |

**CSV-Export (Stufe 0):** diente der Erstanlage, solange es keine API-Anbindung gab. Mit Stufe 3a
(Übertragung per `productSet`) entfernt (G20); Handle-Regel (Name + Produktnummer,
`leinenkissen-sand-0012`), Optionen und Produktmetafelder gelten dort unverändert weiter.

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

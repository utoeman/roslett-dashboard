# Roslett-Dashboard

Internes Warenwirtschafts- und Kalkulationswerkzeug für Roslett.

Der Stand ist **Phase 2**: Fundament, Kalkulations-Engine, Datenbankschema
sowie Stammdatenpflege über API und Oberfläche.

## Aufbau

```
roslett-dashboard/
  packages/core/     Kalkulations-Engine, reines TypeScript
  apps/web/
    shared/schemas/  Zod-Schemas, von Client und Server gemeinsam genutzt
    shared/types/    Antworttypen der API
    app/             Oberfläche: Seiten, Komponenten, Composables
    server/          Nitro-API, Drizzle-Schema, Migrationen
  docker-compose.yml Postgres 16 für die lokale Entwicklung
```

## Sprache

**Der Code ist englisch, die Oberfläche deutsch.** Bezeichner, Tabellen- und
Spaltennamen, API-Pfade und Typen tragen englische Namen. Alles, was der
Nutzer zu sehen bekommt — Beschriftungen, Fehlermeldungen, Hilfetexte — ist
deutsch, ebenso die Kommentare im Code, weil sie deutsches Steuerrecht
erklären.

Die Fachbegriffe folgen dem Handelsüblichen: `landedCost` für den
Einstandspreis, `contributionMargin` für den Deckungsbeitrag, `markup` für
den Aufschlag, `inputTaxDeductible` für vorsteuerabzugsfähig. Die Schlüssel
`fehler` und `felder` in Fehlerantworten bleiben deutsch, weil sie
unverändert im Formular angezeigt werden.

`packages/core` kennt weder Vue noch eine Datenbank. Die Engine lässt sich
deshalb vollständig ohne laufende Infrastruktur testen.

## Voraussetzungen

- Node.js 20 oder neuer
- Docker mit Docker Compose
- npm 10 oder neuer

## Erste Einrichtung

```bash
npm install
cp .env.example .env      # Werte anpassen, insbesondere die Passwörter
npm run passwort:hash     # Zugangspasswort festlegen, Ausgabe in .env eintragen
npm run db:up             # Postgres starten
npm run db:migrate        # Schema anlegen
```

## Zugang

Die ganze App ist mit **einem** Passwort geschützt (keine Benutzerverwaltung).
Ohne Anmeldung führt jede Seite zu `/login`, jeder API-Aufruf antwortet mit 401.
Frei bleibt nur `/api/health`.

| Variable | Inhalt |
|---|---|
| `NUXT_SESSION_PASSWORD` | Schlüssel für das Sitzungscookie, `openssl rand -hex 32` |
| `NUXT_ACCESS_PASSWORD_HASH` | Hash des Passworts aus `npm run passwort:hash` (mind. 12 Zeichen) |

Fehlt der Hash, ist keine Anmeldung möglich – die App bleibt gesperrt, nie offen.
Nach fünf Fehlversuchen ist die Anmeldung von derselben Adresse 15 Minuten gesperrt.

## Starten

```bash
npm start
```

Fährt Postgres hoch, wartet auf dessen Bereitschaft und startet den
Entwicklungsserver auf http://localhost:3000. **Strg+C beendet beides** –
Nuxt und die Datenbank. Das Datenvolume bleibt dabei erhalten.

Wer die beiden Teile getrennt steuern möchte, nimmt weiterhin `npm run db:up`
und `npm run dev`; dann läuft Postgres nach Strg+C weiter, bis
`npm run db:down` folgt.

`.env` ist die einzige Datei, die sich zwischen lokal und produktiv
unterscheidet. Sie steht in `.gitignore` und darf niemals eingecheckt werden.

## Tägliche Befehle

| Befehl | Wirkung |
|---|---|
| `npm start` | Postgres und Entwicklungsserver zusammen; Strg+C beendet beides |
| `npm run dev` | Nur der Entwicklungsserver, ohne Postgres zu starten |
| `npm test` | Alle Tests einmalig ausführen |
| `npm run test:watch` | Tests im Beobachtungsmodus |
| `npm run typecheck` | TypeScript-Prüfung von `packages/core` und der Web-App |
| `npm run lint` | ESLint über das ganze Repo |
| `npm run passwort:hash` | Hash für das Zugangspasswort erzeugen |
| `npm run db:up` | Postgres-Container starten |
| `npm run db:down` | Postgres-Container stoppen |
| `npm run db:generate` | Migration aus geändertem Schema erzeugen |
| `npm run db:migrate` | Ausstehende Migrationen anwenden |
| `npm run db:seed` | Demodaten (7 Produkte aus den Screens) in eine leere Datenbank schreiben |

Nuxt läuft bewusst außerhalb von Docker. Docker Compose startet lokal
ausschließlich Postgres; der Container für die Anwendung kommt erst in Phase 4.

## Was die Anwendung heute kann

Erreichbar unter http://localhost:3000 nach `npm run dev`:

| Bereich | Inhalt |
|---|---|
| Übersicht | Lagerwert (FIFO), Stück am Lager, Varianten unter Mindestbestand, Anzahl der Stammdaten |
| Produkte | Liste mit Suche über Name und SKU, Bestand und Lagerwert, Hinweis unter Mindestbestand; Anlegen mit Kategorie, Preis brutto und MwSt-Kategorie; Übertragen nach Shopify mit Feldvergleich, Bilder je Farbe |
| Produkt-Detail | Stammdaten mit Pflege- und Sicherheitshinweisen bearbeiten, Varianten anlegen und archivieren, je Variante Faser, Herkunft und HS-Code; je Variante Bestand, Ø Einstand, Lagerwert und Marge vor Gebühren; beim Preis eintippen live die Marge; geltende Kostenpositionen |
| Wareneingang | Liste der Lieferantenrechnungen und Produktionen mit Lieferstand; Anlegen mit EZB-Kurs zum Rechnungsdatum |
| Wareneingang-Detail | Positionen im Entwurf, Nebenkosten (auch nachträglich), Einstand je Stück, Zugang buchen inkl. Teillieferung |
| Bestandsjournal | Alle Buchungen mit Filter (Variante, Art, Zeitraum, offene Fehlmengen); Schwund, Eigenverbrauch, Inventur und Rückgabe an Lieferant erfassen; Storno |
| Lieferanten | Anlegen, bearbeiten, archivieren; Standard-Währung für Wareneingänge |
| Kostenpositionen | Anlegen, aktiv schalten, Fix- und Prozentpositionen |
| Kanäle | Anlegen, Gebühren pflegen, aktiv schalten |
| Kategorien, Farben | SKU-Kürzel anlegen, umbenennen, archivieren; verwendete Kürzel sind gesperrt |
| MwSt-Sätze | Sätze je Land und Kategorie mit Gültig-ab; der aktuell gültige ist markiert |
| Hersteller | Herstellerangaben (Name, Geschäftsadresse, E-Mail) für Etikett und Shop |

Verkäufe sind in der Navigation als „folgt" gekennzeichnet.

Preisfelder nehmen `1234,5` wie `1234.50` und zeigen beim Verlassen `1.234,50`.

Währungen sind auf EUR und die EZB-Referenzwährungen beschränkt (`shared/currencies.ts`),
damit es immer einen Tageskurs gibt.

### API

Alle Routen liegen unter `/api`. Der Client spricht sie ausschließlich über
relative Pfade an.

| Methode und Pfad | Zweck |
|---|---|
| `GET /api/health` | Zustand samt Datenbankverbindung |
| `GET /api/products` | Liste mit Bestand je Variante (`inventory`), Parameter `search` (Name, SKU), `categoryId`, `includeArchived` |
| `POST /api/products` | Anlegen; Produktnummer und SKUs vergibt der Server, ohne Varianten entsteht eine Standardvariante |
| `GET /api/products/:id` | Detail samt Varianten und geltenden Kostenpositionen |
| `PATCH /api/products/:id` | Stammdaten ändern, Varianten anlegen; Kategorie, Farbe, Größe und SKU sind fest |
| `GET POST /api/categories`, `PATCH /api/categories/:id` | Kategorie-Kürzel; Kürzel fest, sobald verwendet |
| `GET POST /api/colors`, `PATCH /api/colors/:id` | Farb-Kürzel; Kürzel fest, sobald verwendet |
| `GET POST /api/vat-rates`, `PATCH /api/vat-rates/:id` | MwSt-Sätze je Lieferland, Kategorie und Gültig-ab |
| `GET PUT /api/company-settings` | Herstellerangaben (eine Zeile) |
| `GET POST /api/suppliers`, `PATCH /api/suppliers/:id` | Lieferanten (mit Standard-Währung) |
| `GET POST /api/goods-receipts`, `GET PATCH /api/goods-receipts/:id` | Wareneingänge (Lieferantenrechnungen); ändern nur als Entwurf |
| `POST /api/goods-receipts/:id/costs` | Nebenkosten oder Gutschrift, auch nach dem Buchen; Einstand wirkt rückwirkend |
| `POST /api/goods-receipts/:id/receive` | Zugang buchen, auch als Teillieferung; löst offene Fehlmengen auf |
| `GET POST /api/stock-entries` | Bestandsjournal, Filter `variantId`, `kind`, `from`, `to`, `shortfallsOnly`; manuell: Schwund, Eigenverbrauch, Inventur, Rückgabe an Lieferant |
| `POST /api/stock-entries/:id/reverse` | Storno als Gegenbuchung; nicht möglich, wenn die Ware schon verbraucht ist |
| `GET /api/batches?variantId=` | Chargen einer Variante mit Restbestand (für Rückgaben) |
| `GET /api/stock-value` | Stück am Lager, Lagerwert (FIFO), Varianten unter Mindestbestand |
| `GET POST /api/cost-items`, `PATCH /api/cost-items/:id` | Kostenpositionen |
| `GET POST /api/channels`, `PATCH /api/channels/:id` | Kanäle |

Fehler kommen einheitlich zurück:

```json
{ "statusCode": 422,
  "data": { "fehler": "Die Eingabe konnte nicht verarbeitet werden.",
            "felder": { "sku": "Bereits vergeben." } } }
```

`felder` ordnet jede Meldung dem Formularfeld zu, an dem sie angezeigt gehört.

### Beträge an der Systemgrenze

Die API nimmt Geldbeträge in deutscher wie englischer Schreibweise entgegen
(`"24,90"`, `"1.234,56"`, `24.9`) und gibt sie ausnahmslos als ganzzahlige
Cent zurück. Prozentsätze werden als `6,5` eingegeben und als `0.065`
zurückgeliefert. Umgerechnet wird nur an dieser Grenze, nie dazwischen.

Die Listenantworten haben durchgehend die Form
`{ items, total, limit, offset }`.

## Zustandsprüfung

```bash
curl http://localhost:3000/api/health
```

Antwortet mit HTTP 200 und `"status": "ok"`, wenn die Datenbank erreichbar ist,
sonst mit HTTP 503. Die Ursache steht im Feld `message`, aber nur lokal – die
Route ist ohne Anmeldung erreichbar und verrät produktiv keine Einzelheiten.

## Migrationen

Migrationen laufen **niemals automatisch beim Start**, sondern ausschließlich
über `npm run db:migrate`. Auf einem Server wäre eine Migration beim Hochfahren
gefährlich: mehrere Instanzen würden gleichzeitig migrieren, und ein
fehlgeschlagener Deploy ließe ein halb migriertes Schema zurück.

Schema ändern:

```bash
# 1. apps/web/server/db/schema.ts anpassen
npm run db:generate        # erzeugt die SQL-Migration
# 2. erzeugte Datei prüfen
npm run db:migrate         # wendet sie an
```

Migrationen mit Umbau bestehender Daten werden von Hand geschrieben
(`npx drizzle-kit generate --custom`); der Snapshot muss danach dem Schema
entsprechen, `npm run db:generate` meldet dann „No schema changes“.
Beispiel: `0001_stammdaten_v2.sql` bricht ab, statt vorhandene Produkte zu löschen.

## Fachliche Grundregeln

Diese Regeln sind im Code verankert und dürfen nicht aufgeweicht werden:

- **Geld** liegt intern ausschließlich als ganzzahlige Cent vor. Umgerechnet
  wird nur an der Systemgrenze, über die Hilfsfunktionen in `money.ts`.
- **Alle Kalkulationen laufen netto.** Umsatzsteuer ist ein durchlaufender
  Posten und beeinflusst die Marge nicht.
- **Einfuhrumsatzsteuer gehört nicht in die Selbstkosten**, weil sie als
  Vorsteuer abziehbar ist. **Zoll gehört hinein.** Gesteuert wird das über das
  Flag `vorsteuerabzugsfaehig` je Kostenposition.
- **Marge und Aufschlag sind nicht dasselbe.** Marge ist der Deckungsbeitrag
  bezogen auf den Verkaufspreis, Aufschlag bezogen auf die Selbstkosten. Beide
  werden immer getrennt ausgewiesen.
- **Fremdwährung** wird beim Wareneingang mit dem dann gültigen Kurs
  eingefroren und der Euro-Betrag daneben gespeichert. Zur Anzeigezeit wird nie
  umgerechnet.
- **Der Bestand ist kein Feld.** Er ergibt sich aus dem Buchungsjournal.
- **FIFO-Zuordnungen werden persistiert**, damit Retouren und Stornos exakt
  dorthin zurückbuchen, wo die Ware herkam.
- **Gerundet wird erst am Ende einer Rechenkette**, nicht zwischendrin.

### Beschlossen, noch nicht umgesetzt

Am 17.10.2026 wurde der Code mit dem Fachkonzept abgeglichen. Verbindlich ist ab
jetzt `docs/domain-model.md` (v2), die Einzelentscheidungen stehen in `docs/abgleich.md`.
Die wichtigsten Änderungen gegenüber den Regeln oben:

- **Einstand wird berechnet statt eingefroren.** Nachträgliche Nebenkosten (z. B. ein später
  Zollbescheid) wirken rückwirkend; der Monatsabschluss hält abgeschlossene Monate stabil,
  Differenzen erscheinen als „Korrektur Vormonate“.
- **Zoll und Fracht sind Nebenkosten eines Wareneingangs**, keine Kostenpositionen mehr.
  Kostenpositionen sind nur noch Stückkosten wie Verpackung und gehen in jede Marge ein.
- **Ein Verkaufspreis brutto für alle Kanäle**, Kanalpreise entfallen.
- **SKUs werden automatisch erzeugt** (`ROS-{KAT}-{PRODNR}-{FARBE}-{GROESSE}`) und nie geändert.
- **Fehlmengen** werden mit Warnung gebucht und beim nächsten Zugang aufgelöst.

## Tests

```bash
npm test                       # 142 Tests
npx vitest run --coverage      # mit Abdeckungsbericht
```

Abgedeckt sind die Kalkulations-Engine sowie die Zod-Schemas und
die Umrechnung an der Datenbankgrenze. Darunter Fremdwährung mit eingefrorenem Kurs, gemischte
Fix- und Prozentkosten, vorsteuerabzugsfähige Positionen, rechnerisch
unmögliche Zielmargen, Nebenkostenverteilung über drei Artikel mit stark
unterschiedlichen Werten, FIFO-Abgänge über drei Chargen mit Restmenge und die
Rundung auf Cent.

## Releases

`main` sammelt Features und Fixes, **live ist nur, was released wurde**.

1. GitHub → *Actions* → *Release* → *Run workflow*, Art wählen:
   `patch` (nur Fehlerbehebungen), `minor` (neue Funktionen), `major` (geändertes Verhalten).
2. Der Workflow prüft alles wie die CI, hebt die Version an, schreibt `CHANGELOG.md`,
   wendet die Migrationen auf die Live-Datenbank an, setzt Tag und GitHub-Release und
   schiebt den Branch `production` nach. Netlify veröffentlicht nur `production`.

Damit der Changelog stimmt, beginnen Commit-Titel mit einem Typ: `feat:`, `fix:`,
`perf:`, `docs:`, `ci:`, `build:`, `refactor:` (erscheinen im Changelog) oder `chore:`,
`test:` (erscheinen nicht). `feat!:` markiert geändertes Verhalten.
Benötigte Secrets im Repo: `PRODUCTION_DATABASE_URL` (Release) und `PREVIEW_DATABASE_URL`
(CI migriert nach jedem Push auf `main` die Vorschau-Datenbank).

## Weitere Phasen

Abgeschlossen: Phase 1 (Fundament), Phase 2 (Stammdaten) und Block 3 (Wareneingang & Journal).

Als Nächstes folgt der Umbau auf das Domain-Modell v2 in sechs Blöcken:

1. **Grundlagen:** Design-Tokens (Leinengrau/Oliv), Navigation, „Produkte“ statt „Artikel“, GitHub Actions
2. **Stammdaten:** Kategorie- und Farb-Kürzel, MwSt-Sätze, Preis brutto, SKU-Generator
3. **Wareneingang & Journal:** Beleg mit Nebenkosten, EZB-Kurs, Buchungstypen, Storno, Fehlmenge
4. **Verkauf & Marge:** Verkäufe, Gebühren, Porto, Marge je Kanal
5. **Monatsabschluss**
6. **Screens:** Wareneingang (Desktop und Handy), Verkäufe, Bestandsjournal, Übersicht

Danach: Betrieb auf Netlify + Neon mit Release-Workflow, Etsy-Anbindung, Playwright,
Barrierefreiheit, PWA. Zeitplan: Roadmap M1–M4 in `docs/roadmap.md`, Screens in `docs/screens.md`, Design-Tokens in `docs/design.md`.

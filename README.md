# TRD-Dashboard

Internes Warenwirtschafts- und Kalkulationswerkzeug für The Refined Decor.

Der Stand ist **Phase 2**: Fundament, Kalkulations-Engine, Datenbankschema
sowie Stammdatenpflege über API und Oberfläche.

## Aufbau

```
trd-dashboard/
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
| `npm test` | Tests der Kalkulations-Engine einmalig ausführen |
| `npm run test:watch` | Tests im Beobachtungsmodus |
| `npm run typecheck` | TypeScript-Prüfung von `packages/core` und der Web-App |
| `npm run lint` | ESLint über das ganze Repo |
| `npm run passwort:hash` | Hash für das Zugangspasswort erzeugen |
| `npm run db:up` | Postgres-Container starten |
| `npm run db:down` | Postgres-Container stoppen |
| `npm run db:generate` | Migration aus geändertem Schema erzeugen |
| `npm run db:migrate` | Ausstehende Migrationen anwenden |

Nuxt läuft bewusst außerhalb von Docker. Docker Compose startet lokal
ausschließlich Postgres; der Container für die Anwendung kommt erst in Phase 4.

## Was die Anwendung heute kann

Erreichbar unter http://localhost:3000 nach `npm run dev`:

| Bereich | Inhalt |
|---|---|
| Übersicht | Anzahl der Stammdaten je Bereich |
| Artikel | Liste mit Suche über Name und Artikelnummer, Anlegen, Detailansicht |
| Artikel-Detail | Stammdaten bearbeiten, Varianten anlegen und archivieren, geltende Kostenpositionen |
| Lieferanten | Anlegen, bearbeiten, archivieren |
| Kostenpositionen | Anlegen, aktiv schalten, Fix- und Prozentpositionen |
| Kanäle | Anlegen, Gebühren pflegen, aktiv schalten |

Wareneingang, Buchungen und Inventur sind in der Navigation als „folgt"
gekennzeichnet und entstehen in Phase 3.

### API

Alle Routen liegen unter `/api`. Der Client spricht sie ausschließlich über
relative Pfade an.

| Methode und Pfad | Zweck |
|---|---|
| `GET /api/health` | Zustand samt Datenbankverbindung |
| `GET /api/products` | Liste, Parameter `search`, `category`, `includeArchived` |
| `POST /api/products` | Anlegen; ohne Variantenangabe entsteht eine Standardvariante |
| `GET /api/products/:id` | Detail samt Varianten und geltenden Kostenpositionen |
| `PATCH /api/products/:id` | Stammdaten ändern, Varianten anlegen und ändern |
| `GET POST /api/suppliers`, `PATCH /api/suppliers/:id` | Lieferanten |
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

Am 17.10.2026 wurde der Code mit dem fachlichen Interview abgeglichen. Verbindlich ist ab
jetzt `docs/domain-model.md` (v2), die Einzelentscheidungen stehen in `docs/abgleich.md`.
Die wichtigsten Änderungen gegenüber den Regeln oben:

- **Einstand wird berechnet statt eingefroren.** Nachträgliche Nebenkosten (z. B. ein später
  Zollbescheid) wirken rückwirkend; der Monatsabschluss hält abgeschlossene Monate stabil,
  Differenzen erscheinen als „Korrektur Vormonate“.
- **Zoll und Fracht sind Nebenkosten eines Wareneingangs**, keine Kostenpositionen mehr.
  Kostenpositionen sind nur noch Stückkosten wie Verpackung und gehen in jede Marge ein.
- **Ein Verkaufspreis brutto für alle Kanäle**, Kanalpreise entfallen.
- **SKUs werden automatisch erzeugt** (`TRD-{KAT}-{PRODNR}-{FARBE}-{GROESSE}`) und nie geändert.
- **Fehlmengen** werden mit Warnung gebucht und beim nächsten Zugang aufgelöst.

## Tests

```bash
npm test                       # 142 Tests
npx vitest run --coverage      # mit Abdeckungsbericht
```

Abgedeckt sind die Kalkulations-Engine (97 Tests) sowie die Zod-Schemas und
die Umrechnung an der Datenbankgrenze (45 Tests). Darunter Fremdwährung mit eingefrorenem Kurs, gemischte
Fix- und Prozentkosten, vorsteuerabzugsfähige Positionen, rechnerisch
unmögliche Zielmargen, Nebenkostenverteilung über drei Artikel mit stark
unterschiedlichen Werten, FIFO-Abgänge über drei Chargen mit Restmenge und die
Rundung auf Cent.

## Weitere Phasen

Abgeschlossen: Phase 1 (Fundament) und Phase 2 (Stammdaten).

Als Nächstes folgt der Umbau auf das Domain-Modell v2 in sechs Blöcken:

1. **Grundlagen:** Design-Tokens (Leinengrau/Oliv), Navigation, „Produkte“ statt „Artikel“, GitHub Actions
2. **Stammdaten:** Kategorie- und Farb-Kürzel, MwSt-Sätze, Preis brutto, SKU-Generator
3. **Wareneingang & Journal:** Beleg mit Nebenkosten, EZB-Kurs, Buchungstypen, Storno, Fehlmenge
4. **Verkauf & Marge:** Verkäufe, Gebühren, Porto, Marge je Kanal
5. **Monatsabschluss**
6. **Screens:** Wareneingang (Desktop und Handy), Verkäufe, Bestandsjournal, Übersicht

Danach: Betrieb auf Netlify + Neon mit Release-Workflow, Etsy-Anbindung, Playwright,
Barrierefreiheit, PWA. Zeitplan: Roadmap M1–M4 (`docs/trd-zusammenfassung.md`, Abschnitt 1.2).

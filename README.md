# TRD-Dashboard

Internes Warenwirtschafts- und Kalkulationswerkzeug für The Refined Decor.

Der Stand ist **Phase 1**: Fundament, Kalkulations-Engine und Datenbankschema.
Die Oberfläche entsteht ab Phase 2.

## Aufbau

```
trd-dashboard/
  packages/core/     Kalkulations-Engine, reines TypeScript
  apps/web/          Nuxt 4 im SPA-Modus, Nitro-API, Drizzle-Schema
  docker-compose.yml Postgres 16 für die lokale Entwicklung
```

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
npm run db:up             # Postgres starten
npm run db:migrate        # Schema anlegen
```

`.env` ist die einzige Datei, die sich zwischen lokal und produktiv
unterscheidet. Sie steht in `.gitignore` und darf niemals eingecheckt werden.

## Tägliche Befehle

| Befehl | Wirkung |
|---|---|
| `npm run dev` | Entwicklungsserver auf http://localhost:3000 mit Hot Reload |
| `npm test` | Tests der Kalkulations-Engine einmalig ausführen |
| `npm run test:watch` | Tests im Beobachtungsmodus |
| `npm run typecheck` | TypeScript-Prüfung von `packages/core` |
| `npm run db:up` | Postgres-Container starten |
| `npm run db:down` | Postgres-Container stoppen |
| `npm run db:generate` | Migration aus geändertem Schema erzeugen |
| `npm run db:migrate` | Ausstehende Migrationen anwenden |

Nuxt läuft bewusst außerhalb von Docker. Docker Compose startet lokal
ausschließlich Postgres; der Container für die Anwendung kommt erst in Phase 4.

## Zustandsprüfung

```bash
curl http://localhost:3000/api/health
```

Antwortet mit HTTP 200 und `"status": "ok"`, wenn die Datenbank erreichbar ist,
sonst mit HTTP 503 und der Ursache im Feld `meldung`.

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

## Tests

```bash
npm test                       # 97 Tests
npx vitest run --coverage      # mit Abdeckungsbericht
```

Abgedeckt sind unter anderem Fremdwährung mit eingefrorenem Kurs, gemischte
Fix- und Prozentkosten, vorsteuerabzugsfähige Positionen, rechnerisch
unmögliche Zielmargen, Nebenkostenverteilung über drei Artikel mit stark
unterschiedlichen Werten, FIFO-Abgänge über drei Chargen mit Restmenge und die
Rundung auf Cent.

## Weitere Phasen

- **Phase 2** Stammdaten: Artikel mit Varianten, Lieferanten, Kostenpositionen,
  Kanäle. CRUD über API und Oberfläche.
- **Phase 3** Bewegung und Kalkulation: Wareneingang, FIFO-Abgänge, Retouren,
  Inventur, Kalkulator, Dashboard, CSV-Export, Login.
- **Phase 4** Produktivbetrieb: Dockerfile, `docker-compose.prod.yml`,
  Sicherungsstrategie, Deployment-Anleitung.

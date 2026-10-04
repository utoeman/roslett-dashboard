# TRD-Dashboard – CLAUDE.md

> Ebene ③ (Projekt). Allgemeine Arbeitsweise: `~/Skopeweb/CLAUDE.md`, Projektrahmen:
> `../CLAUDE.md`. Ausführlich (API, Phasen, Fachregeln mit Begründung): `README.md`.

Internes Warenwirtschafts- und Kalkulationswerkzeug für The Refined Decor.
Stand: Phase 2 abgeschlossen, nächste Phase 3 (Wareneingang, FIFO, Retouren, Inventur,
Kalkulator, Login).

## Stack

- npm-Workspaces: `packages/core` (Kalkulations-Engine, reines TypeScript, ohne Vue/DB)
  und `apps/web` (Nuxt + Nitro-API, Drizzle, Zod-Schemas in `shared/`).
- Postgres 16 per Docker (`docker-compose.yml`, nur DB); Nuxt läuft außerhalb von Docker.
- Tests: Vitest.

## Befehle

```bash
npm start              # Postgres + Dev-Server (localhost:3000), Strg+C beendet beides
npm test               # alle Tests
npm run typecheck
npm run db:generate    # Migration aus apps/web/server/db/schema.ts erzeugen
npm run db:migrate     # Migrationen anwenden – nie automatisch beim Start
```

## Sprache

**Code englisch, Oberfläche deutsch.** Bezeichner, Tabellen, API-Pfade englisch; alles
Sichtbare und die Code-Kommentare deutsch. Fehlerschlüssel `fehler`/`felder` bleiben deutsch.

## Fachregeln (nicht aufweichen)

- Geld intern nur als ganzzahlige **Cent**; Umrechnung nur an der Systemgrenze (`money.ts`).
- Kalkulation **netto**. Einfuhrumsatzsteuer nicht in Selbstkosten, Zoll schon.
- Marge ≠ Aufschlag, immer getrennt ausweisen.
- Fremdwährung beim Wareneingang mit Kurs einfrieren.
- Bestand ist kein Feld, sondern ergibt sich aus dem Buchungsjournal. FIFO-Zuordnungen persistieren.
- Runden erst am Ende einer Rechenkette.

## Nachweis

| Änderung | Nachweis |
|---|---|
| `packages/core`, Schemas, Umrechnung | Test zuerst (TDD), `npm test` grün |
| Typen / Schnittstellen | `npm run typecheck` grün |
| API | `curl localhost:3000/api/…` mit erwarteter Antwort; `/api/health` = 200 |
| Oberfläche | Sichtprüfung im Browser |
| Schema | `db:generate`, erzeugtes SQL prüfen, `db:migrate` |

## Secrets

`.env` nie ausgeben oder einchecken; nur `.env.example` ist getrackt.

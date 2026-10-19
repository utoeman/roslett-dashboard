# TRD-Dashboard – CLAUDE.md

> Ebene ③ (Projekt). Allgemeine Arbeitsweise: `~/Skopeweb/CLAUDE.md`, Projektrahmen:
> `../CLAUDE.md`. Ausführlich (API, Phasen, Fachregeln mit Begründung): `README.md`.

Internes Warenwirtschafts- und Kalkulationswerkzeug für The Refined Decor.
Stand: Phase 2 abgeschlossen. Am 17.10.2026 mit dem Interview-Modell abgeglichen; Umbau in
Blöcken 1–6 steht an (Plan in `docs/abgleich.md`). Zeitplan: Roadmap M1–M4 (`docs/trd-zusammenfassung.md`, Abschnitt 1.2).

## Fachliche Quelle

- `docs/domain-model.md` (v2) – **verbindliches Modell**: Entitäten, Buchungstypen, Regeln.
- `docs/abgleich.md` – Einzelentscheidungen Interview ↔ Code mit Datum.
- `docs/trd-zusammenfassung.md` – Interview-Protokoll, 8 Screens samt HTML-Quellcode, Design-Tokens.
  Screens gelten als Vorlage für Inhalt und Abläufe, Zahlen darin sind Demodaten.

## Stack

- npm-Workspaces: `packages/core` (Kalkulations-Engine, reines TypeScript, ohne Vue/DB)
  und `apps/web` (Nuxt + Nitro-API, Drizzle, Zod-Schemas in `shared/`).
- Postgres 16 per Docker (`docker-compose.yml`, nur DB); Nuxt läuft außerhalb von Docker.
- Tests: Vitest.
- UI: Nuxt UI als Basis + eigene Fachbausteine; Design-Tokens aus dem Interview (Leinengrau/Oliv).
- Zugang: ein Passwort für die ganze App (nuxt-auth-utils, `server/middleware/auth.ts`);
  jede neue API-Route ist automatisch geschützt, Ausnahmen nur in `PUBLIC_PATHS`.
- CI: GitHub Actions (Lint, Typecheck, Tests, Build). Geplant: Betrieb auf Netlify + Neon,
  Release per Hand-Workflow, live = Branch `production`.

## Befehle

```bash
npm start              # Postgres + Dev-Server (localhost:3000), Strg+C beendet beides
npm test               # alle Tests
npm run typecheck
npm run lint
npm run passwort:hash  # Hash für NUXT_ACCESS_PASSWORD_HASH (Zugangspasswort)
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
- Fremdwährung beim Wareneingang mit Kurs einfrieren (EZB-Kurs am Rechnungsdatum).
- Bestand ist kein Feld, sondern ergibt sich aus dem Buchungsjournal. FIFO-Zuordnungen
  (welche Charge, welche Menge) persistieren.
- Journal unveränderlich: Korrektur nur per Storno-Buchung, die auf das Original zeigt.
- Einstand wird berechnet, nicht gespeichert; nachträgliche Nebenkosten wirken rückwirkend.
  Abgeschlossene Monate bleiben unverändert und werden nie wieder geöffnet.
- Ein Verkaufspreis (brutto) für alle Kanäle; Stückkosten gehen in jede Marge ein.
- SKU wird automatisch erzeugt und nie geändert.
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

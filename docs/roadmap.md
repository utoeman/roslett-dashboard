# Stack und Roadmap

## Stack

| Bereich | Technologie | Warum das Dashboard sie braucht |
|---|---|---|
| Framework | Vue 3 (Composition API) + Nuxt 4 | Routing, Server-Routes und Build aus einer Hand |
| Sprache | TypeScript (strict) | FIFO-Chargen, Margen, Währungen: Rechenfehler beim Kompilieren finden |
| UI | Nuxt UI + Design-Tokens ([design.md](design.md)) | Viele Tabellen und Formulare, einheitlicher Look |
| Design | Screen-Entwürfe vor dem Coden ([screens.md](screens.md)) | Erst Abläufe klären, dann bauen |
| Validierung | Zod, gemeinsam für Client und Server | Valide Daten Pflicht, eine Quelle für beide Seiten |
| Backend | Nuxt Server-Routes (Nitro) als REST-API | Journal und Kalkulation serverseitig |
| Datenbank | PostgreSQL + Drizzle ORM | Relationale Daten, FIFO braucht saubere Abfragen |
| Externe APIs | Shopify Admin API (GraphQL), EZB-Wechselkurse | Verkäufe aller Kanäle kommen über Shopify ([shopify-integration.md](shopify-integration.md)); Fremdwährung umrechnen |
| Auth | nuxt-auth-utils (Session-Login) | Geschäftsdaten schützen |
| Tests | Vitest | Kalkulation muss stimmen |
| Qualität | ESLint, TypeScript-Prüfung in der CI | Einheitlicher Code |
| Git und CI | Feature-Branches, GitHub Actions (Lint, Typecheck, Tests, Build), Dependabot | Jeder Push geprüft |
| Betrieb | Netlify + Neon, Release per Workflow | Tool soll wirklich laufen |
| Doku | README, Domain-Modell, Entscheidungen | Nachvollziehbar, warum etwas so gebaut ist |

Geplant: Apache ECharts für Diagramme, Playwright für Ende-zu-Ende-Tests, axe und
Lighthouse-Budget in der CI, PWA für den Wareneingang am Handy. Optional: KI-Entwurf
für Listing-Texte.

Bewusst nicht im Dashboard: GSAP, Three.js, Bootstrap, React, AWS/Azure-Dienste. Dezente Übergänge mit Vue `<Transition>`.

## Roadmap

**M1 – Fundament**
- [x] Kern-Screens entworfen ([screens.md](screens.md))
- [x] Domain-Modell schriftlich ([domain-model.md](domain-model.md))
- [x] Nuxt + TypeScript strict + ESLint, Repo mit README
- [x] Design-Tokens ([design.md](design.md))
- [x] GitHub Actions: Lint, Typecheck, Tests, Build

**M2 – Kernfunktion**
- [x] PostgreSQL + Drizzle: Tabellen, Migrationen, Seed-Daten
- [x] REST-Endpunkte für Produkte, Varianten, Wareneingänge
- [x] Formulare mit Zod-Validierung auf Client und Server
- [x] Bestandsjournal mit FIFO-Logik + Vitest
- [x] Login und Deployment

**M3 – Geschäftswert**
- [x] Margen inkl. MwSt. und Fremdwährung (EZB-Kurs am Rechnungsdatum)
- [x] Shopify Stufe 0: Produktion (Eigenfertigung), Herstellerangaben, Faserfelder
- [x] Shopify Stufe 1: Bestellungen und Erstattungen aller Kanäle abrufen, FIFO und Marge rechnen
- [x] Shopify Stufe 2–4: Preise, Zugänge, Produkte, Bilder und Bestandsänderungen übertragen
- [ ] Monatsabschluss mit „Korrektur Vormonate“
- [ ] Diagramme (Marge pro Produkt, Lagerwert, Umsatz nach Kanal)

**M4 – Feinschliff**
- [ ] Playwright-E2E
- [ ] Barrierefreiheit (axe, Tastatur), Lighthouse-Budget in CI
- [ ] PWA
- [x] Screenshots im README

## Offene fachliche Fragen

- [ ] MwSt. bei EU-Verkäufen (OSS-Schwelle, Rolle von Etsy als Marktplatz) mit Steuerberatung klären; das Modell speichert den Satz pro Position und ist für beide Fälle offen.
- [ ] Kürzel-Listen für SKUs final festlegen (Kategorien, Farben).
- [ ] Sets/Bundles: kommen sie, und wann? (Eigenfertigung: entschieden, siehe abgleich.md Schritt 9, C6)
- [ ] Echte Werte für Kanalgebühren, Versandpreis und Versandkostengrenze.
- [ ] Optionales KI-Feature (Etsy-Listing-Texte) ja/nein.

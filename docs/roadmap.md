# Stack und Roadmap

## Stack

| Bereich | Technologie | Warum das Dashboard sie braucht |
|---|---|---|
| Framework | Vue 3 (Composition API) + Nuxt | Routing, Server-Routes und Build aus einer Hand |
| Sprache | TypeScript (strict) | FIFO-Chargen, Margen, Währungen: Rechenfehler beim Kompilieren finden |
| Build | Vite (in Nuxt enthalten) | Kommt mit Nuxt |
| Styling | Tailwind CSS + Design-Tokens | Viele Tabellen und Formulare, einheitlicher Look |
| UI-Bausteine | Eigene Komponentenbibliothek (Button, Input, DataTable, Modal) in Histoire | Dieselben Bausteine überall, dokumentiert und isoliert testbar |
| Design | Klickbare Screen-Entwürfe vor dem Coden ([screens.md](screens.md)) | Erst Abläufe klären, dann bauen |
| State | Pinia | Filter, Einkaufserfassung, Einstellungen (Währung, MwSt.) |
| Formulare | VeeValidate + Zod | Valide Daten Pflicht; Zod-Schema auch serverseitig |
| Backend | Nuxt Server-Routes (Nitro) als REST-API | Journal und Kalkulation serverseitig |
| Datenbank | PostgreSQL + Drizzle ORM | Relationale Daten, FIFO braucht saubere Abfragen |
| Externe APIs | Shopify Admin API (GraphQL), EZB-Wechselkurse | Verkäufe aller Kanäle kommen über Shopify ([shopify-integration.md](shopify-integration.md)); Fremdwährung umrechnen |
| Diagramme | Apache ECharts (vue-echarts) | Marge pro Produkt, Lagerwert, Umsatz nach Kanal |
| Auth | nuxt-auth-utils (Session-Login) | Geschäftsdaten schützen |
| Mobile | Responsive + PWA | Wareneingang am Handy im Lager |
| Barrierefreiheit | WCAG 2.2 AA, axe-Checks | Tastaturbedienung in Tabellen und Formularen |
| Tests | Vitest (FIFO/Marge), Playwright (Wareneingang bis Verkauf) | Kalkulation muss stimmen |
| Qualität | ESLint, Prettier, Lighthouse-Budget | Einheitlicher Code, messbare Performance |
| Git und CI | Feature-Branches, GitHub Actions (Lint, Typecheck, Tests, Build) | Jeder Push geprüft |
| Betrieb | Netlify + Neon, Release per Workflow | Tool soll wirklich laufen |
| Doku | README, Domain-Modell, Entscheidungen | Nachvollziehbar, warum etwas so gebaut ist |

Optional: KI-Entwurf für Listing-Texte.

Bewusst nicht im Dashboard: GSAP, Three.js, Bootstrap, React, AWS/Azure-Dienste. Dezente Übergänge mit Vue `<Transition>`.

## Roadmap

**M1 – Fundament (Woche 1–2)**
- [x] Kern-Screens entworfen ([screens.md](screens.md))
- [x] Domain-Modell schriftlich ([domain-model.md](domain-model.md))
- [x] Nuxt + TypeScript strict + Tailwind + ESLint, Repo mit README
- [ ] Design-Tokens und 5 Basiskomponenten in Histoire
- [x] GitHub Actions: Lint, Typecheck, Tests, Build

**M2 – Kernfunktion vorzeigbar (Woche 3–4)**
- [ ] PostgreSQL + Drizzle: Tabellen, Migrationen, Seed-Daten
- [ ] REST-Endpunkte für Produkte, Varianten, Wareneingänge
- [ ] Formulare mit VeeValidate + Zod
- [ ] Bestandsjournal mit FIFO-Logik + Vitest
- [x] Login und Deployment; Live-Demo mit Demodaten

**M3 – Geschäftswert (Woche 5–7)**
- [ ] Margen inkl. MwSt. und Fremdwährung (EZB-Kurs am Rechnungsdatum)
- [x] Shopify Stufe 0: Produktion (Eigenfertigung), Herstellerangaben, Faserfelder, CSV-Export für Shopify
- [ ] Shopify Stufe 1 (nur lesen, Polling): Bestellungen und Erstattungen aller Kanäle abrufen, FIFO und Marge rechnen
- [ ] ECharts-Diagramme
- [ ] Pinia für Filter und Einstellungen

**M4 – Feinschliff (Woche 8–10)**
- [ ] Playwright-E2E
- [ ] Barrierefreiheit (axe, Tastatur), Lighthouse-Budget in CI
- [ ] PWA
- [ ] Entscheidungsprotokolle, Screenshots, Demo-Video im README

## Offene fachliche Fragen

- [ ] MwSt. bei EU-Verkäufen (OSS-Schwelle, Rolle von Etsy als Marktplatz) mit Steuerberatung klären; das Modell speichert den Satz pro Position und ist für beide Fälle offen.
- [ ] Kürzel-Listen für SKUs final festlegen (Kategorien, Farben).
- [ ] Sets/Bundles: kommen sie, und wann? (Eigenfertigung: entschieden, siehe abgleich.md Schritt 9, C6)
- [ ] Echte Werte für Kanalgebühren, Versandpreis und Versandkostengrenze.
- [ ] Optionales KI-Feature (Etsy-Listing-Texte) ja/nein.

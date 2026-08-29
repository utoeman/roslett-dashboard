# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## Ergänzung Skopeweb: Regel 4 in Themes ohne Testsuite

Gilt für **alle** Themes unter `wp-content/themes/` — bestehende wie zukünftige.

Regel 4 gilt **sinngemäß, nicht wörtlich**: Erfolgskriterium ist etwas
nachweislich Überprüfbares, nicht zwingend ein automatisierter Test. Keine
Testinfrastruktur aufbauen, nur um einen Bugfix zu rechtfertigen.

Als Nachweis zählt, was für die Änderung einschlägig ist:

| Art der Änderung | Nachweis |
|---|---|
| JS / Blocks | `npm run build` läuft fehlerfrei durch |
| CSS / Tailwind | Build grün; wo vorhanden `npm run verify:tailwind` |
| Linting-relevant | `npm run lint:js` / `lint:style`, sofern im Theme vorhanden |
| PHP | Seite lädt auf `localhost:8080`, `wp-content/debug.log` ohne neue Fehler |
| Sichtbares Frontend | Sichtprüfung der betroffenen Seite im Browser |
| Reine Text-/Metadatenänderung | Wiederholte Suche liefert überall den gleichen Wert; `git diff` enthält nur die beabsichtigten Zeilen |

Nicht jede Zeile braucht jede Zeile der Tabelle — passend zur Änderung auswählen.

**Echte Tests bleiben Pflicht,** wo eigenständige Logik entsteht: PHP-Funktionen
in `inc/` mit Verzweigungen, Datenumformung, JS jenseits von Block-Registrierung.
Dort gilt weiterhin die Skill `test-driven-development`.

**Vorher ansagen, nachher belegen.** Vor der Umsetzung nennen, welcher Nachweis
gilt; danach den Befehl wirklich ausführen und die Ausgabe zeigen. Kein „müsste
passen" ohne Beleg.

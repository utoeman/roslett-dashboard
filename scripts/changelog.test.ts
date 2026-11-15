import { describe, expect, it } from 'vitest';
import { buildSection, parseCommit, prependSection } from './changelog';

const c = (subject: string, body = '') => ({ subject, body });

describe('parseCommit', () => {
  it('liest Typ, Bereich und Text', () => {
    expect(parseCommit(c('fix(api): Doppelte SKU sauber melden'))).toEqual({
      type: 'fix',
      scope: 'api',
      text: 'Doppelte SKU sauber melden',
      breaking: false,
    });
  });

  it('ignoriert Commits ohne Typ und Release-Commits', () => {
    expect(parseCommit(c('Phase 2: Stammdaten'))).toBeNull();
    expect(parseCommit(c('Merge pull request #1 from x/y'))).toBeNull();
    expect(parseCommit(c('chore(release): v0.2.0'))).toBeNull();
  });

  it('erkennt geaendertes Verhalten an ! und an BREAKING CHANGE', () => {
    expect(parseCommit(c('feat!: Preise brutto'))?.breaking).toBe(true);
    expect(parseCommit(c('feat: Preise brutto', 'BREAKING CHANGE: Netto entfaellt'))?.breaking).toBe(true);
  });
});

describe('buildSection', () => {
  it('gruppiert in fester Reihenfolge und laesst chore/test weg', () => {
    const section = buildSection('v0.2.0', '2026-10-19', [
      c('docs: Domain-Modell v2'),
      c('fix: Klick sprang zum Artikel'),
      c('feat: Zugangsschutz'),
      c('chore: Abhaengigkeiten'),
      c('test: mehr Faelle'),
      c('ci: ESLint'),
      c('Phase 1: Monorepo'),
    ]);
    expect(section).toBe(
      [
        '## v0.2.0 (2026-10-19)',
        '',
        '### Neu',
        '',
        '- Zugangsschutz',
        '',
        '### Fehlerbehebungen',
        '',
        '- Klick sprang zum Artikel',
        '',
        '### Doku',
        '',
        '- Domain-Modell v2',
        '',
        '### Technik',
        '',
        '- ESLint',
        '',
      ].join('\n'),
    );
  });

  it('stellt geaendertes Verhalten an den Anfang', () => {
    const section = buildSection('v1.0.0', '2026-12-01', [c('feat(preise)!: Preise brutto')]);
    expect(section.indexOf('### Achtung')).toBeLessThan(section.indexOf('### Neu'));
    expect(section).toContain('- **preise:** Preise brutto');
  });

  it('meldet einen Release ohne Eintraege ausdruecklich', () => {
    expect(buildSection('v0.2.1', '2026-10-20', [c('chore: x')])).toContain('Keine nennenswerten Änderungen.');
  });
});

describe('prependSection', () => {
  it('legt die Datei beim ersten Release an', () => {
    const result = prependSection('', '## v0.2.0 (2026-10-19)\n');
    expect(result.startsWith('# Changelog\n')).toBe(true);
    expect(result).toContain('## v0.2.0');
  });

  it('stellt neue Abschnitte ueber die alten', () => {
    const first = prependSection('', '## v0.2.0 (2026-10-19)\n');
    const second = prependSection(first, '## v0.3.0 (2026-11-02)\n');
    expect(second.indexOf('v0.3.0')).toBeLessThan(second.indexOf('v0.2.0'));
    expect(second.match(/# Changelog/g)).toHaveLength(1);
  });

  it('endet nach jedem Release mit genau einem Zeilenumbruch', () => {
    let file = '';
    for (const version of ['v0.1.0', 'v0.2.0', 'v0.3.0']) file = prependSection(file, `## ${version} (2026-10-19)\n`);
    expect(file.endsWith('v0.1.0 (2026-10-19)\n')).toBe(true);
  });
});

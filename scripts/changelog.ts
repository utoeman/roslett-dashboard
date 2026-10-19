/**
 * Changelog aus Commit-Titeln (Conventional Commits).
 *
 * Aufruf: node scripts/changelog.ts <version> [--notes <datei>]
 * - liest alle Commits seit dem letzten Tag (beim ersten Release: alle),
 * - stellt den neuen Abschnitt oben in CHANGELOG.md ein,
 * - schreibt ihn mit --notes zusaetzlich in eine Datei (Text des GitHub-Release).
 *
 * Gezaehlt wird nur, was einen Typ traegt ("feat: …", "fix(api): …").
 * Aeltere Commits ohne Typ, Merge-Commits und Release-Commits fallen heraus.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Commit {
  subject: string;
  body: string;
}

/** Reihenfolge = Reihenfolge im Changelog. Typen ohne Eintrag erscheinen nicht. */
const GROUPS: { title: string; types: string[] }[] = [
  { title: 'Neu', types: ['feat'] },
  { title: 'Fehlerbehebungen', types: ['fix'] },
  { title: 'Schneller', types: ['perf'] },
  { title: 'Doku', types: ['docs'] },
  { title: 'Technik', types: ['ci', 'build', 'refactor'] },
];

const PATTERN = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s*(?<text>.+)$/;

interface Parsed {
  type: string;
  scope?: string;
  text: string;
  breaking: boolean;
}

export function parseCommit(commit: Commit): Parsed | null {
  const match = PATTERN.exec(commit.subject.trim());
  if (!match?.groups) return null;
  const { type, scope, breaking, text } = match.groups;
  if (!type || !text) return null;
  if (type === 'chore' && scope === 'release') return null;
  return {
    type,
    scope,
    text,
    breaking: breaking === '!' || /^BREAKING CHANGE:/m.test(commit.body),
  };
}

export function buildSection(version: string, date: string, commits: Commit[]): string {
  const parsed = commits.map(parseCommit).filter((c): c is Parsed => c !== null);
  const line = (c: Parsed) => `- ${c.scope ? `**${c.scope}:** ` : ''}${c.text}`;

  const parts: string[] = [`## ${version} (${date})`];

  const breaking = parsed.filter((c) => c.breaking);
  if (breaking.length > 0) {
    parts.push(`### Achtung: geändertes Verhalten\n\n${breaking.map(line).join('\n')}`);
  }
  for (const group of GROUPS) {
    const entries = parsed.filter((c) => group.types.includes(c.type));
    if (entries.length > 0) {
      parts.push(`### ${group.title}\n\n${entries.map(line).join('\n')}`);
    }
  }
  if (parts.length === 1) {
    parts.push('Keine nennenswerten Änderungen.');
  }
  return `${parts.join('\n\n')}\n`;
}

const HEADER = '# Changelog\n\nAlle Releases des TRD-Dashboards, neueste zuerst.\n';

export function prependSection(existing: string, section: string): string {
  const rest = existing.startsWith(HEADER) ? existing.slice(HEADER.length).trimStart() : existing.trim();
  return `${HEADER}\n${section}${rest ? `\n${rest}\n` : ''}`;
}

function git(args: string[]): string {
  // stderr verschlucken: "keine Namen gefunden" vor dem ersten Tag ist erwartet.
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function readCommits(): Commit[] {
  let range = 'HEAD';
  try {
    range = `${git(['describe', '--tags', '--abbrev=0']).trim()}..HEAD`;
  } catch {
    // Noch kein Tag: erster Release, alle Commits.
  }
  const raw = git(['log', range, '--no-merges', '--format=%s%x1f%b%x1e']);
  return raw
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [subject = '', body = ''] = entry.split('\x1f');
      return { subject, body };
    });
}

function main(argv: string[]): void {
  const [version, flag, notesFile] = argv;
  if (!version || !/^v\d+\.\d+\.\d+$/.test(version)) {
    console.error('Aufruf: node scripts/changelog.ts v1.2.3 [--notes <datei>]');
    process.exit(1);
  }
  const date = new Date().toISOString().slice(0, 10);
  const section = buildSection(version, date, readCommits());

  const file = resolve('CHANGELOG.md');
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';
  writeFileSync(file, prependSection(existing, section));

  if (flag === '--notes' && notesFile) {
    // Im Release-Text ohne die Ueberschrift, die zeigt GitHub selbst an.
    writeFileSync(notesFile, section.split('\n').slice(2).join('\n'));
  }
  console.log(section);
}

// Nur als Skript ausfuehren, nicht beim Import aus den Tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}

/**
 * Sperre gegen das Durchprobieren von Passwoertern.
 *
 * Nach fuenf Fehlversuchen von derselben Adresse ist die Anmeldung dort fuer
 * 15 Minuten gesperrt. Der Zaehler liegt im Speicher des Server-Prozesses. Auf
 * Netlify laufen mehrere kurzlebige Instanzen, die Sperre ist dort also nur
 * eine Bremse und kein harter Riegel – den eigentlichen Schutz liefert ein
 * langes Passwort (mindestens 12 Zeichen, siehe access-password.ts).
 *
 * Die Zeit wird uebergeben statt gelesen, damit die Tests ohne Uhr auskommen.
 */

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60_000;

interface Entry {
  failures: number;
  firstFailureAt: number;
}

export class LoginAttempts {
  private readonly entries = new Map<string, Entry>();

  isBlocked(key: string, now: number): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    if (now - entry.firstFailureAt >= WINDOW_MS) {
      this.entries.delete(key);
      return false;
    }
    return entry.failures >= MAX_FAILURES;
  }

  recordFailure(key: string, now: number): void {
    const entry = this.entries.get(key);
    if (!entry || now - entry.firstFailureAt >= WINDOW_MS) {
      this.entries.set(key, { failures: 1, firstFailureAt: now });
      return;
    }
    entry.failures += 1;
  }

  reset(key: string): void {
    this.entries.delete(key);
  }
}

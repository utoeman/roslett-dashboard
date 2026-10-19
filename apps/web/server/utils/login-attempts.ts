/**
 * Locks login for 15 minutes after five failures per address. In-memory, so on
 * serverless it only slows attackers down; the real protection is a long
 * password. `now` is passed in to keep tests clock-free.
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

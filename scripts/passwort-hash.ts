/**
 * Erzeugt den Hash fuer das Zugangspasswort (NUXT_ACCESS_PASSWORD_HASH).
 *
 * Aufruf: npm run passwort:hash
 * Das Passwort wird verdeckt abgefragt und landet weder in der Shell-Historie
 * noch in einer Datei. Ausgegeben wird nur der Hash.
 *
 * Laeuft direkt mit Node (ab 22.18 werden Typen ohne Zusatzwerkzeug entfernt).
 */

import { stdin, stdout } from 'node:process';
import { hashAccessPassword } from '../apps/web/server/utils/access-password.ts';

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    stdout.write(question);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (char: string) => {
      if (char === '\r' || char === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off('data', onData);
        stdout.write('\n');
        resolve(value);
      } else if (char === '\u0003') {
        // Strg+C
        stdout.write('\n');
        process.exit(1);
      } else if (char === '\u007f') {
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    };
    stdin.on('data', onData);
  });
}

const first = await askHidden('Neues Zugangspasswort (mind. 12 Zeichen): ');
const second = await askHidden('Noch einmal: ');
if (first !== second) {
  console.error('Die beiden Eingaben stimmen nicht ueberein.');
  process.exit(1);
}

try {
  const hash = await hashAccessPassword(first);
  console.log('\nIn .env bzw. bei Netlify eintragen:\n');
  console.log(`NUXT_ACCESS_PASSWORD_HASH=${hash}\n`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

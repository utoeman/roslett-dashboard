/**
 * Prints the hash for NUXT_ACCESS_PASSWORD_HASH. The password is read hidden
 * and never stored. Runs directly on Node >= 22.18 (type stripping).
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
        // Ctrl+C
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

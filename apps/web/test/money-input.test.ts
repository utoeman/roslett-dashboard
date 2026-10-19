/** Price fields: what the user types and what the field shows after leaving it. */

import { describe, expect, it } from 'vitest';
import { useMoney } from '../app/composables/useMoney.js';

const { toInput, tidyInput } = useMoney();

describe('toInput – Vorbelegung mit Tausenderpunkt', () => {
  it('gruppiert Tausender und zeigt zwei Nachkommastellen', () => {
    expect(toInput(123450)).toBe('1.234,50');
    expect(toInput(4490)).toBe('44,90');
    expect(toInput(null)).toBe('');
  });
});

describe('tidyInput – Formatierung beim Verlassen des Feldes', () => {
  it.each([
    ['1234,5', '1.234,50'],
    ['1234.50', '1.234,50'],
    ['1.234', '1.234,00'],
    ['39,9', '39,90'],
    ['  12 ', '12,00'],
    ['1234567,89', '1.234.567,89'],
  ])('%s → %s', (input, expected) => {
    expect(tidyInput(input)).toBe(expected);
  });

  it('laesst leere und ungueltige Eingaben stehen, damit der Server sie meldet', () => {
    expect(tidyInput('')).toBe('');
    expect(tidyInput('zwölf')).toBe('zwölf');
  });
});

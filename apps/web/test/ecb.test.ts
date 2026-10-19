import { describe, expect, it } from 'vitest';
import { parseEcbCsv } from '../server/utils/ecb.js';

// Shape of the ECB data API (format=csvdata), trimmed to the relevant columns.
const csv = [
  'KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE,OBS_STATUS,TITLE',
  'EXR.D.TRY.EUR.SP00.A,D,TRY,EUR,SP00,A,2026-10-08,55.0523,A,"Turkish lira/Euro, reference"',
  'EXR.D.TRY.EUR.SP00.A,D,TRY,EUR,SP00,A,2026-10-09,55.1100,A,"Turkish lira/Euro, reference"',
  'EXR.D.TRY.EUR.SP00.A,D,TRY,EUR,SP00,A,2026-10-12,55.3000,A,"Turkish lira/Euro, reference"',
].join('\n');

describe('parseEcbCsv', () => {
  it('nimmt den Kurs genau am Rechnungsdatum', () => {
    expect(parseEcbCsv(csv, '2026-10-09')).toEqual({ rate: 55.11, date: '2026-10-09' });
  });

  it('nimmt am Wochenende den letzten Werktag davor', () => {
    expect(parseEcbCsv(csv, '2026-10-11')).toEqual({ rate: 55.11, date: '2026-10-09' });
  });

  it('ergibt null ohne passenden Kurs oder bei fremdem Format', () => {
    expect(parseEcbCsv(csv, '2026-10-01')).toBeNull();
    expect(parseEcbCsv('', '2026-10-09')).toBeNull();
    expect(parseEcbCsv('A,B\n1,2', '2026-10-09')).toBeNull();
  });
});

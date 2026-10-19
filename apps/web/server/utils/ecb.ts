/** ECB reference rates: units of foreign currency per 1 EUR, for an invoice date. */

import { badRequest } from './errors.js';

/** Latest observation on or before `date`, or null. */
export function parseEcbCsv(csv: string, date: string): { rate: number; date: string } | null {
  const [header, ...rows] = csv.trim().split(/\r?\n/);
  if (!header) return null;
  const columns = header.split(',');
  const timeIndex = columns.indexOf('TIME_PERIOD');
  const valueIndex = columns.indexOf('OBS_VALUE');
  if (timeIndex < 0 || valueIndex < 0) return null;

  let best: { rate: number; date: string } | null = null;
  for (const row of rows) {
    // Quoted fields with commas only appear after these columns.
    const cells = row.split(',');
    const day = cells[timeIndex];
    const rate = Number(cells[valueIndex]);
    if (!day || day > date || !Number.isFinite(rate) || rate <= 0) continue;
    if (best === null || day > best.date) best = { rate, date: day };
  }
  return best;
}

export async function fetchEcbRate(currency: string, date: string): Promise<{ rate: number; date: string }> {
  if (currency === 'EUR') return { rate: 1, date };
  if (!/^[A-Z]{3}$/.test(currency)) throw badRequest('Ungültiger Währungscode.', { currency: 'Ungültig.' });

  // Ten days back covers weekends and holidays.
  const start = new Date(`${date}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 10);
  const url =
    `https://data-api.ecb.europa.eu/service/data/EXR/D.${currency}.EUR.SP00.A` +
    `?startPeriod=${start.toISOString().slice(0, 10)}&endPeriod=${date}&format=csvdata`;

  let csv = '';
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (response.ok) csv = await response.text();
  } catch {
    // Handled below like a missing rate.
  }
  const result = parseEcbCsv(csv, date);
  if (result === null) {
    throw badRequest(`Für ${currency} wurde kein EZB-Kurs bis ${date} gefunden. Bitte den Kurs von Hand eingeben.`, {
      exchangeRate: 'Bitte von Hand eingeben.',
    });
  }
  return result;
}

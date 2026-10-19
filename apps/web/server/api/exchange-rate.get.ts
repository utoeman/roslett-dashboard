import { z } from 'zod';
import { isoDateSchema } from '../../shared/schemas/goods-receipt.js';
import { readQuery } from '../utils/validation.js';
import { fetchEcbRate } from '../utils/ecb.js';

const querySchema = z.object({
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, { message: 'Ungültiger Währungscode.' }),
  date: isoDateSchema,
});

/** ECB rate (foreign units per EUR) for a date, to preview it in the receipt form. */
export default defineEventHandler(async (event) => {
  const { currency, date } = readQuery(event, querySchema);
  return { currency, ...(await fetchEcbRate(currency, date)) };
});

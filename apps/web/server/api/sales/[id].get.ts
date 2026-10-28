import { useDb } from '../../db/client.js';
import { readId, requireFound } from '../../utils/validation.js';
import { loadSales } from '../../utils/sales.js';

/** Sale with lines, fees, FIFO cost and margin per line. */
export default defineEventHandler(async (event) => {
  const [sale] = await loadSales(useDb(), [readId(event)]);
  return requireFound(sale, 'Der Verkauf');
});

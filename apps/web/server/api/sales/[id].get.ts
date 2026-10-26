import { useDb } from '../../db/client.js';
import { readId, requireFound } from '../../utils/validation.js';
import { loadSale } from '../../utils/sales.js';

/** Sale with lines, fees, FIFO cost and margin per line. */
export default defineEventHandler(async (event) => {
  return requireFound(await loadSale(useDb(), readId(event)), 'Der Verkauf');
});

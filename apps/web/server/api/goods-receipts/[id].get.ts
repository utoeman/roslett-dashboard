import { useDb } from '../../db/client.js';
import { readId, requireFound } from '../../utils/validation.js';
import { loadReceipt } from '../../utils/stock.js';

/** Receipt with positions, computed landed cost, delivery state and additional costs. */
export default defineEventHandler(async (event) => {
  return requireFound(await loadReceipt(useDb(), readId(event)), 'Der Wareneingang');
});

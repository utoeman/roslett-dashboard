import { triggerShopifySync } from '../cron.mts';

/** Nightly reconciliation: the last 48 hours again, regardless of the cursor (UTC 02:00). */
export default async (): Promise<void> => {
  await triggerShopifySync('nightly');
};

export const config = { schedule: '0 2 * * *' };

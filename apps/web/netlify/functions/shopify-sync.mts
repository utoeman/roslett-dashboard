import { triggerShopifySync } from '../cron.mts';

/** G10: orders, refunds and cancellations every 15 minutes. */
export default async (): Promise<void> => {
  await triggerShopifySync('scheduled');
};

export const config = { schedule: '*/15 * * * *' };

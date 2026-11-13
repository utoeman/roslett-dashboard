import { calculateTotalCost, costItemsForVariant, type CostItem as CoreCostItem } from '@roslett/core';
import type { Channel, CostItem, List } from '~~/shared/types/api';

/** Active channels with their flat fee, as the margin preview and price suggestion need them (G31). */
export async function useChannelMargins() {
  const { data } = await useFetch<List<Channel>>('/api/channels', { query: { activeOnly: true } });

  const channels = computed(
    () =>
      data.value?.items.map((c) => ({
        id: c.id,
        name: c.name,
        feePercent: c.feePercent ?? 0,
        feeFixed: c.feeFixed ?? 0,
      })) ?? [],
  );

  /** Landed cost plus the variant's cost items (packaging …), like the margin of a sale. */
  function totalCost(landed: number | null, variantId: string, items: readonly CostItem[]): number | null {
    if (landed === null) return null;
    const usable = items.flatMap((i): CoreCostItem[] => (i.value === null ? [] : [{ ...i, value: i.value }]));
    return calculateTotalCost(landed, costItemsForVariant(usable, variantId)).totalCostEur;
  }

  return { channels, totalCost };
}

<script setup lang="ts">
import { MoneyError, marginBeforeFees, parseMoney } from '@trd/core';

/**
 * Live margin before fees while a gross price is typed: net price minus the
 * average landed cost of the given variants (a range if they differ).
 */
const props = defineProps<{
  /** Typed gross price; empty falls back to `fallbackCents`. */
  price: string;
  fallbackCents?: number | null;
  vatRate: number | undefined;
  /** Average landed cost per variant; null where nothing has been received yet. */
  costs: (number | null)[];
}>();

const { formatMoney, formatPercent } = useMoney();

/** Below this margin the line turns amber. */
const LOW_MARGIN = 0.3;

const priceCents = computed(() => {
  if (props.price.trim() === '') return props.fallbackCents ?? null;
  try {
    return parseMoney(props.price);
  } catch (error) {
    if (error instanceof MoneyError) return null;
    throw error;
  }
});

const known = computed(() => props.costs.filter((c): c is number => c !== null));

const result = computed(() => {
  if (priceCents.value === null || props.vatRate === undefined || known.value.length === 0) return null;
  const margins = known.value.map((cost) => marginBeforeFees(priceCents.value ?? 0, props.vatRate ?? 0, cost));
  const pick = (key: 'contributionMarginEur' | 'margin') => {
    const values = margins.map((m) => m[key]);
    return { min: Math.min(...values), max: Math.max(...values) };
  };
  return {
    net: margins[0]?.salesPriceNetEur ?? 0,
    cost: { min: Math.min(...known.value), max: Math.max(...known.value) },
    euro: pick('contributionMarginEur'),
    rate: pick('margin'),
  };
});

const range = (r: { min: number; max: number }, format: (v: number) => string) =>
  r.min === r.max ? format(r.min) : `${format(r.min)} – ${format(r.max)}`;

const tone = computed(() => {
  const lowest = result.value?.rate.min;
  if (lowest === undefined) return 'text-leinen-500';
  if (lowest < 0) return 'text-red-700';
  if (lowest < LOW_MARGIN) return 'text-amber-700';
  return 'text-leinen-600';
});
</script>

<template>
  <p v-if="result" class="text-xs" :class="tone" aria-live="polite">
    Netto {{ formatMoney(result.net) }} · Ø Einstand {{ range(result.cost, formatMoney) }} ·
    <span class="font-medium">
      Marge {{ range(result.euro, formatMoney) }} ({{ range(result.rate, (v) => formatPercent(v)) }})
    </span>
    vor Gebühren
  </p>
  <p v-else-if="priceCents !== null && known.length === 0" class="text-xs text-leinen-500">
    Noch kein Einstand – die Marge erscheint nach dem ersten gebuchten Wareneingang.
  </p>
</template>

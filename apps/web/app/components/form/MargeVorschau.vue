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
  /** Average landed cost and its purchase-price part per variant; null where nothing has been received yet. */
  costs: { landed: number | null; purchase: number | null }[];
}>();

const { formatMoney, formatPercent } = useMoney();

/** Below this margin the box turns amber; at or above it green. */
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

const known = computed(() =>
  props.costs.flatMap((c) => (c.landed === null ? [] : [{ landed: c.landed, purchase: c.purchase ?? c.landed }])),
);
const span = (values: number[]) => ({ min: Math.min(...values), max: Math.max(...values) });

const result = computed(() => {
  if (priceCents.value === null || props.vatRate === undefined || known.value.length === 0) return null;
  const margins = known.value.map((c) => marginBeforeFees(priceCents.value ?? 0, props.vatRate ?? 0, c.landed));
  const pick = (key: 'contributionMarginEur' | 'margin') => {
    const values = margins.map((m) => m[key]);
    return { min: Math.min(...values), max: Math.max(...values) };
  };
  return {
    gross: priceCents.value,
    net: margins[0]?.salesPriceNetEur ?? 0,
    cost: span(known.value.map((c) => c.landed)),
    purchase: span(known.value.map((c) => c.purchase)),
    extra: span(known.value.map((c) => c.landed - c.purchase)),
    euro: pick('contributionMarginEur'),
    rate: pick('margin'),
  };
});

const range = (r: { min: number; max: number }, format: (v: number) => string) =>
  r.min === r.max ? format(r.min) : `${format(r.min)} – ${format(r.max)}`;

// Solid surface, border and dark text from the brand scales; the icon repeats the state for colour-blind users.
const tone = computed(() => {
  const lowest = result.value?.rate.min ?? 0;
  if (lowest < 0) {
    return { box: 'border-trderror-500 bg-trderror-200 text-trderror-800', iconColor: 'text-trderror-600', icon: 'i-lucide-circle-alert', label: 'Verlust' };
  }
  if (lowest < LOW_MARGIN) {
    return { box: 'border-trdwarning-500 bg-trdwarning-200 text-trdwarning-800', iconColor: 'text-trdwarning-600', icon: 'i-lucide-triangle-alert', label: 'Knapp' };
  }
  return { box: 'border-trdsuccess-500 bg-trdsuccess-200 text-trdsuccess-800', iconColor: 'text-trdsuccess-600', icon: 'i-lucide-circle-check', label: 'Gut' };
});
</script>

<template>
  <div
    v-if="result"
    class="flex items-start gap-2 rounded-[8px] border-l-4 px-3 py-2 text-sm"
    :class="tone.box"
    aria-live="polite"
  >
    <UIcon :name="tone.icon" class="mt-0.5 size-5 shrink-0" :class="tone.iconColor" aria-hidden="true" />
    <div>
      <p class="font-semibold">
        {{ tone.label }}: Marge vor Kanalgebühren {{ range(result.euro, formatMoney) }} ({{
          range(result.rate, (v) => formatPercent(v))
        }})
      </p>
      <!-- Reads top to bottom as the calculation: net price minus landed cost. -->
      <dl class="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-xs">
        <dt>Verkaufspreis netto</dt>
        <dd>
          <span class="tabular-nums">{{ formatMoney(result.net) }}</span>
          ({{ formatMoney(result.gross) }} ohne {{ formatPercent(vatRate, 0) }} MwSt)
        </dd>
        <dt>− Ø Einstand</dt>
        <dd>
          <span class="tabular-nums">{{ range(result.cost, formatMoney) }}</span>
          (EK {{ range(result.purchase, formatMoney) }} + Nebenkosten {{ range(result.extra, formatMoney) }})
        </dd>
      </dl>
    </div>
  </div>
  <p v-else-if="priceCents !== null && known.length === 0" class="text-xs text-leinen-500">
    Noch kein Einstand – die Marge erscheint nach dem ersten gebuchten Wareneingang.
  </p>
</template>

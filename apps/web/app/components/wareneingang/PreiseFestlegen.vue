<script setup lang="ts">
import { PricingError, suggestGrossPrice } from '@roslett/core';
import type { ProductDetail, ReceiptPosition, ShopifyProductPushResult } from '~~/shared/types/api';

/**
 * Sets the sales price once the landed cost is known (G31): per product the
 * landed cost of this receipt, a suggestion from the target margin and the
 * margin per channel. Prices are stored on the product.
 */
const props = defineProps<{ positions: ReceiptPosition[] }>();
const emit = defineEmits<{ shopify: [] }>();

const { formatMoney, toInput } = useMoney();
const { readError } = useApiError();
const { channels, totalCost } = await useChannelMargins();

const productIds = computed(() => [...new Set(props.positions.map((p) => p.variant.productId))]);
const { data: products, refresh } = await useAsyncData(
  'preise-festlegen',
  () => Promise.all(productIds.value.map((id) => $fetch<ProductDetail>(`/api/products/${id}`))),
  { watch: [productIds] },
);

const targetPercent = ref(40);
const prices = reactive<Record<string, string>>({});
watch(
  products,
  (list) => {
    for (const p of list ?? []) prices[p.id] ??= toInput(p.basePriceGross);
  },
  { immediate: true },
);

const span = (values: number[]) => ({ min: Math.min(...values), max: Math.max(...values) });

const rows = computed(() =>
  (products.value ?? []).map((product) => {
    const positions = props.positions.filter((p) => p.variant.productId === product.id);
    const costs = positions.map((p) => ({
      landed: p.landedCostEur,
      purchase: p.unitPriceEur,
      total: totalCost(p.landedCostEur, p.variant.id, product.costItems),
    }));
    const vatRate = product.vatRates[product.vatCategory];
    let suggestion: number | null = null;
    let suggestionError: string | null = null;
    if (vatRate !== undefined && costs.length > 0) {
      try {
        // The most expensive variant of the delivery decides, so every colour reaches the target.
        suggestion = suggestGrossPrice({
          totalCostEur: Math.max(...costs.map((c) => c.total ?? c.landed)),
          vatRate,
          targetMargin: targetPercent.value / 100,
          channels: channels.value,
        });
      } catch (error) {
        if (!(error instanceof PricingError)) throw error;
        suggestionError = error.message;
      }
    }
    return {
      product,
      labels: positions.map((p) => p.variant.label || p.variant.sku).join(', '),
      quantity: positions.reduce((total, p) => total + p.quantityOrdered, 0),
      landed: span(costs.map((c) => c.landed)),
      costs,
      vatRate,
      suggestion,
      suggestionError,
      ownPrices: product.variants.filter((v) => v.archivedAt === null && v.priceGross !== null),
    };
  }),
);

const range = (r: { min: number; max: number }) =>
  r.min === r.max ? formatMoney(r.min) : `${formatMoney(r.min)} – ${formatMoney(r.max)}`;

const busy = ref(false);
const errors = ref<Record<string, string>>({});
const notes = ref<string[]>([]);

/** Saves changed base prices; false if any product failed. */
async function save(): Promise<boolean> {
  errors.value = {};
  notes.value = [];
  let ok = true;
  for (const { product } of rows.value) {
    const typed = prices[product.id] ?? '';
    if (typed === toInput(product.basePriceGross)) continue;
    try {
      await $fetch(`/api/products/${product.id}`, { method: 'PATCH', body: { basePriceGross: typed || null } });
    } catch (err) {
      errors.value[product.id] = readError(err).message;
      ok = false;
    }
  }
  await refresh();
  for (const p of products.value ?? []) prices[p.id] = toInput(p.basePriceGross);
  return ok;
}

async function saveOnly() {
  busy.value = true;
  try {
    if (await save()) notes.value = ['Preise gespeichert.'];
  } finally {
    busy.value = false;
  }
}

/** Saves, pushes every product, then opens the stock transfer of the receipt. */
async function saveAndPush() {
  busy.value = true;
  try {
    if (!(await save())) return;
    for (const { product } of rows.value) {
      try {
        const result = await $fetch<ShopifyProductPushResult>(`/api/products/${product.id}/shopify`, { method: 'POST' });
        notes.value.push(`${product.name}: übertragen.`, ...result.warnings.map((w) => `${product.name}: ${w}`));
      } catch (err) {
        errors.value[product.id] = readError(err).message;
      }
    }
    if (Object.keys(errors.value).length === 0) emit('shopify');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="rounded-[12px] border border-leinen-200/70 bg-white" style="border-width: 0.5px">
    <div class="flex flex-wrap items-end justify-between gap-3 px-4 py-3">
      <div>
        <h2 class="text-sm font-semibold">Preise festlegen</h2>
        <p class="mt-0.5 text-xs text-leinen-500">
          Verkaufspreis brutto je Produkt, gilt für alle Farben. Der Vorschlag erreicht die Zielmarge auf jedem
          aktiven Kanal nach dessen Gebühr und endet auf ,90.
        </p>
      </div>
      <UFormField label="Zielmarge" class="w-28">
        <UInput v-model.number="targetPercent" type="number" min="0" max="95" step="1" class="w-full">
          <template #trailing><span class="text-xs text-leinen-500">%</span></template>
        </UInput>
      </UFormField>
    </div>

    <p v-if="channels.length === 0" class="mx-4 mb-3 rounded-[8px] bg-leinen-50 px-3 py-2 text-xs text-leinen-600">
      Kein aktiver Kanal: Vorschlag und Marge gelten vor Gebühren. Kanäle legen Sie unter
      <NuxtLink to="/einstellungen/kanaele" class="underline">Einstellungen › Kanäle</NuxtLink> an.
    </p>

    <div class="divide-y divide-leinen-200/70 border-t border-leinen-200/70">
      <div v-for="row in rows" :key="row.product.id" class="grid gap-3 px-4 py-3 sm:grid-cols-2">
        <div class="min-w-0 space-y-1 text-sm">
          <NuxtLink :to="`/produkte/${row.product.id}`" class="font-medium hover:underline">{{ row.product.name }}</NuxtLink>
          <p class="text-xs text-leinen-500">{{ row.quantity }} Stück · {{ row.labels }}</p>
          <p class="text-xs">
            Einstand <span class="font-mono">{{ range(row.landed) }}</span>
          </p>
          <p v-if="row.suggestion !== null" class="flex items-center gap-2 text-xs">
            Vorschlag <span class="font-mono font-medium">{{ formatMoney(row.suggestion) }}</span>
            <UButton
              size="xs"
              variant="link"
              class="px-0"
              @click="prices[row.product.id] = toInput(row.suggestion)"
            >
              übernehmen
            </UButton>
          </p>
          <p v-else-if="row.suggestionError" class="text-xs text-roserror-700">{{ row.suggestionError }}</p>
          <p v-if="row.ownPrices.length > 0" class="text-xs text-leinen-500">
            Eigener Preis bei {{ row.ownPrices.map((v) => `${v.label} (${formatMoney(v.priceGross)})`).join(', ') }} –
            ändern Sie ihn auf der Produktseite.
          </p>
        </div>
        <div class="space-y-2">
          <UFormField label="Preis brutto" :error="errors[row.product.id]">
            <BetragFeld v-model="prices[row.product.id]" class="w-full" />
          </UFormField>
          <MargeVorschau
            :price="prices[row.product.id] ?? ''"
            :vat-rate="row.vatRate"
            :costs="row.costs"
            :channels="channels"
          />
        </div>
      </div>
    </div>

    <div class="space-y-2 border-t border-leinen-200/70 px-4 py-3">
      <ul v-if="notes.length > 0" class="space-y-0.5 text-xs text-leinen-600">
        <li v-for="note in notes" :key="note">{{ note }}</li>
      </ul>
      <div class="flex flex-wrap justify-end gap-2">
        <UButton variant="outline" color="neutral" class="rounded-[8px]" :loading="busy" @click="saveOnly">
          Preise speichern
        </UButton>
        <UButton icon="i-lucide-upload" class="rounded-[8px]" :loading="busy" @click="saveAndPush">
          Speichern und nach Shopify
        </UButton>
      </div>
    </div>
  </section>
</template>

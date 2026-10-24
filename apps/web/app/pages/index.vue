<script setup lang="ts">
import type { StockSummary } from '~~/shared/types/api';

useHead({ title: 'Übersicht' });

const { formatMoney } = useMoney();

// Load counts and stock totals in parallel; `limit: 1` because only `total` is needed.
const { data, pending, error } = await useAsyncData(
  'overview-metrics',
  async () => {
    const [stock, products, suppliers, costItems, channels] = await Promise.all([
      $fetch<StockSummary>('/api/stock-value'),
      $fetch<{ total: number }>('/api/products', { query: { limit: 1 } }),
      $fetch<{ total: number }>('/api/suppliers', { query: { limit: 1 } }),
      $fetch<{ total: number }>('/api/cost-items', { query: { limit: 1 } }),
      $fetch<{ total: number }>('/api/channels', { query: { limit: 1 } }),
    ]);
    return {
      stock,
      products: products.total,
      suppliers: suppliers.total,
      costItems: costItems.total,
      channels: channels.total,
    };
  },
);

const tiles = computed(() => [
  { name: 'Lagerwert (FIFO)', value: formatMoney(data.value?.stock.valueEur ?? 0), path: '/produkte' },
  { name: 'Stück am Lager', value: data.value?.stock.units ?? 0, path: '/journal' },
  { name: 'Unter Mindestbestand', value: data.value?.stock.variantsBelowMinimum ?? 0, path: '/produkte' },
  { name: 'Produkte', value: data.value?.products ?? 0, path: '/produkte' },
  {
    name: 'Lieferanten',
    value: data.value?.suppliers ?? 0,
    path: '/einstellungen/lieferanten',
  },
  {
    name: 'Kostenpositionen',
    value: data.value?.costItems ?? 0,
    path: '/einstellungen/kostenpositionen',
  },
  { name: 'Kanäle', value: data.value?.channels ?? 0, path: '/einstellungen/kanaele' },
]);
</script>

<template>
  <div>
    <SeitenKopf titel="Übersicht" hinweis="Bestand und Stammdaten im Überblick" />

    <div class="px-6 py-4">
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        class="mb-4 rounded-[12px]"
        title="Die Kennzahlen konnten nicht geladen werden."
        description="Läuft die Datenbank? Prüfen Sie die Verbindung und laden Sie die Seite neu."
      />

      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <NuxtLink
          v-for="tile in tiles"
          :key="tile.name"
          :to="tile.path"
          class="group cursor-pointer rounded-[12px] border border-leinen-200/70 bg-white dark:bg-leinen-900 px-4 py-3 transition-colors hover:border-ros-300 hover:bg-ros-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ros-500 dark:border-leinen-800 dark:hover:border-ros-800 dark:hover:bg-ros-950/20"
          style="border-width: 0.5px"
        >
          <p class="text-xs uppercase tracking-wide text-leinen-500">{{ tile.name }}</p>
          <div class="mt-1 flex items-center justify-between">
            <p class="zahl text-2xl font-semibold tabular-nums">
              <span v-if="pending && !data" class="text-leinen-300 dark:text-leinen-700">–</span>
              <span v-else>{{ tile.value }}</span>
            </p>
            <!-- The arrow signals that the tile is a link. -->
            <UIcon
              name="i-lucide-arrow-right"
              class="size-4 text-leinen-300 transition-colors group-hover:text-ros-500 dark:text-leinen-700"
              aria-hidden="true"
            />
          </div>
        </NuxtLink>
      </div>

      <div
        class="mt-6 rounded-[12px] border border-leinen-200/70 bg-white dark:bg-leinen-900 px-4 py-3 text-sm dark:border-leinen-800"
        style="border-width: 0.5px"
      >
        <p class="font-medium">Nächster Schritt</p>
        <p class="mt-0.5 text-leinen-600 dark:text-leinen-400">
          Als Nächstes folgen Verkäufe mit Abgang nach FIFO und Retouren sowie
          der Kalkulator mit Kanalgebühren und Kostenpositionen.
        </p>
      </div>
    </div>
  </div>
</template>

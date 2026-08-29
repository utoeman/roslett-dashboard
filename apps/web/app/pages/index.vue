<script setup lang="ts">
useHead({ title: 'Übersicht' });

/*
 * Alle vier Zaehlwerte gemeinsam laden. Jede Liste liefert `total` mit,
 * sodass hier nur die Zahl gebraucht wird und nicht der gesamte Datensatz.
 * `limit: 1` haelt die uebertragene Menge klein – gezaehlt wird in der
 * Datenbank, nicht im Browser.
 */
const { data, pending, error } = await useAsyncData(
  'overview-metrics',
  async () => {
    const [products, suppliers, costItems, channels] = await Promise.all([
      $fetch<{ total: number }>('/api/products', { query: { limit: 1 } }),
      $fetch<{ total: number }>('/api/suppliers', { query: { limit: 1 } }),
      $fetch<{ total: number }>('/api/cost-items', { query: { limit: 1 } }),
      $fetch<{ total: number }>('/api/channels', { query: { limit: 1 } }),
    ]);
    return {
      products: products.total,
      suppliers: suppliers.total,
      costItems: costItems.total,
      channels: channels.total,
    };
  },
);

const tiles = computed(() => [
  { name: 'Artikel', value: data.value?.products ?? 0, path: '/artikel' },
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
    <SeitenKopf titel="Übersicht" hinweis="Stammdaten im Überblick" />

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
          class="group cursor-pointer rounded-[12px] border border-zinc-200/70 px-4 py-3 transition-colors hover:border-trd-300 hover:bg-trd-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trd-500 dark:border-zinc-800 dark:hover:border-trd-800 dark:hover:bg-trd-950/20"
          style="border-width: 0.5px"
        >
          <p class="text-xs uppercase tracking-wide text-zinc-500">{{ tile.name }}</p>
          <div class="mt-1 flex items-center justify-between">
            <p class="zahl text-2xl font-semibold tabular-nums">
              <span v-if="pending && !data" class="text-zinc-300 dark:text-zinc-700">–</span>
              <span v-else>{{ tile.value }}</span>
            </p>
            <!-- Der Pfeil macht sichtbar, dass die Kachel irgendwohin führt. -->
            <UIcon
              name="i-lucide-arrow-right"
              class="size-4 text-zinc-300 transition-colors group-hover:text-trd-500 dark:text-zinc-700"
              aria-hidden="true"
            />
          </div>
        </NuxtLink>
      </div>

      <div
        class="mt-6 rounded-[12px] border border-zinc-200/70 px-4 py-3 text-sm dark:border-zinc-800"
        style="border-width: 0.5px"
      >
        <p class="font-medium">Nächster Schritt</p>
        <p class="mt-0.5 text-zinc-600 dark:text-zinc-400">
          Bestandsführung und Kalkulation folgen in Phase 3: Wareneingang mit
          Chargen, Abgänge nach FIFO, Retouren, Inventur und der Kalkulator.
        </p>
      </div>
    </div>
  </div>
</template>

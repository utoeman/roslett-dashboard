<script setup lang="ts">
import type { ShopifyMatchRow, ShopifyStatus } from '~~/shared/types/api';

useHead({ title: 'Shopify' });

const { readError } = useApiError();
const { data, pending, error, refresh } = await useFetch<ShopifyStatus>('/api/shopify/status', { lazy: true });

const linking = ref(false);
const message = ref<string | null>(null);

const toLink = computed(() => data.value?.rows.filter((r) => r.status === 'matched').length ?? 0);
const loadError = computed(() => (error.value ? readError(error.value).message : null));

const statusText: Record<ShopifyMatchRow['status'], string> = {
  linked: 'verknüpft',
  matched: 'gefunden',
  missing: 'fehlt in Shopify',
  duplicate: 'SKU mehrfach in Shopify',
};

async function link() {
  linking.value = true;
  message.value = null;
  try {
    const result = await $fetch<{ linked: number }>('/api/shopify/link', { method: 'POST' });
    message.value = `${result.linked} Varianten verknüpft.`;
    await refresh();
  } catch (err) {
    message.value = readError(err).message;
  } finally {
    linking.value = false;
  }
}
</script>

<template>
  <div>
    <SeitenKopf
      titel="Shopify"
      hinweis="Verbindung zum Shop und Zuordnung der Varianten über die SKU. Hier wird nur gelesen; Bestände bucht das Dashboard nicht um."
    />

    <div class="space-y-4 px-6 py-4">
      <div v-if="pending && !data" class="py-12 text-center text-sm text-leinen-500">Shopify wird abgefragt …</div>

      <UAlert v-else-if="loadError" color="error" variant="soft" :title="loadError" />

      <UAlert
        v-else-if="data && !data.configured"
        color="warning"
        variant="soft"
        title="Die Shopify-Anbindung ist nicht eingerichtet."
        description="NUXT_SHOPIFY_SHOP, NUXT_SHOPIFY_CLIENT_ID und NUXT_SHOPIFY_CLIENT_SECRET als Umgebungsvariablen setzen."
      />

      <template v-else-if="data">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-leinen-600">
            Verbunden mit <strong>{{ data.shop }}</strong>
          </p>
          <div class="flex gap-2">
            <UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" :loading="pending" @click="refresh()">
              Neu abfragen
            </UButton>
            <UButton icon="i-lucide-link" :disabled="toLink === 0" :loading="linking" @click="link">
              {{ toLink }} Varianten verknüpfen
            </UButton>
          </div>
        </div>

        <UAlert v-if="message" color="neutral" variant="soft" :title="message" />

        <div class="overflow-x-auto rounded-[12px] border border-leinen-200/70 bg-white" style="border-width: 0.5px">
          <table class="ros-tabelle w-full min-w-[44rem] text-sm">
            <thead
              class="border-b border-leinen-200/70 bg-leinen-50/60 text-left text-xs font-medium uppercase tracking-wide text-leinen-500 dark:border-leinen-800 dark:bg-leinen-900/40"
            >
              <tr>
                <th class="px-4">SKU</th>
                <th class="px-4">Produkt</th>
                <th class="px-4 text-right">Bestand Dashboard</th>
                <th class="px-4 text-right">Bestand Shopify</th>
                <th class="px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in data.rows" :key="row.variantId">
                <td class="px-4 font-mono text-xs">{{ row.sku }}</td>
                <td class="px-4">{{ row.productName }}</td>
                <td class="px-4 text-right tabular-nums">{{ row.dashboardStock }}</td>
                <td
                  class="px-4 text-right tabular-nums"
                  :class="{ 'text-roswarning-700': row.shopifyStock !== null && row.shopifyStock !== row.dashboardStock }"
                >
                  {{ row.shopifyStock ?? '–' }}
                </td>
                <td class="px-4">{{ statusText[row.status] }}</td>
              </tr>
              <tr v-if="data.rows.length === 0">
                <td colspan="5" class="px-4 py-6 text-center text-leinen-500">Keine aktiven Varianten im Dashboard.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="data.unknownInShopify.length > 0" class="text-sm text-leinen-600">
          <p class="font-medium">In Shopify, aber nicht im Dashboard ({{ data.unknownInShopify.length }}):</p>
          <ul class="mt-1 list-inside list-disc font-mono text-xs">
            <li v-for="v in data.unknownInShopify" :key="v.variantId">{{ v.sku || 'ohne SKU' }}</li>
          </ul>
        </div>
      </template>
    </div>
  </div>
</template>

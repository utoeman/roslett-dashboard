<script setup lang="ts">
import type { ShopifyMatchRow, ShopifyStatus, ShopifySyncResult } from '~~/shared/types/api';

useHead({ title: 'Shopify' });

const { readError } = useApiError();
const { data, pending, error, refresh } = await useFetch<ShopifyStatus>('/api/shopify/status', { lazy: true });

const linking = ref(false);
const message = ref<string | null>(null);
const syncing = ref(false);
const syncResult = ref<ShopifySyncResult | null>(null);
const syncError = ref<string | null>(null);

const syncedText = computed(() =>
  data.value?.ordersSyncedTo
    ? new Date(data.value.ordersSyncedTo).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
    : 'noch nie',
);

const toLink = computed(() => data.value?.rows.filter((r) => r.status === 'matched').length ?? 0);
const loadError = computed(() => (error.value ? readError(error.value).message : null));

const statusText: Record<ShopifyMatchRow['status'], string> = {
  linked: 'verknüpft',
  matched: 'gefunden',
  missing: 'fehlt in Shopify',
  duplicate: 'SKU mehrfach in Shopify',
};

async function sync() {
  syncing.value = true;
  syncError.value = null;
  syncResult.value = null;
  try {
    syncResult.value = await $fetch<ShopifySyncResult>('/api/shopify/sync', { method: 'POST' });
    await refresh();
  } catch (err) {
    syncError.value = readError(err).message;
  } finally {
    syncing.value = false;
  }
}

// Check list: Shopify's count wins, booked as stocktake only after a click with a note.
const adjusting = ref<ShopifyMatchRow | null>(null);
const adjustNote = ref('');
const adjustSaving = ref(false);
const adjustErrors = ref<Record<string, string>>({});
const adjustMessage = ref<string | null>(null);
const adjustOpen = computed({
  get: () => adjusting.value !== null,
  set: (open: boolean) => {
    if (!open) adjusting.value = null;
  },
});
const deviates = (row: ShopifyMatchRow) =>
  row.status === 'linked' && row.shopifyStock !== null && row.shopifyStock !== row.dashboardStock;

function openAdjust(row: ShopifyMatchRow) {
  adjusting.value = row;
  adjustNote.value = 'Abgleich mit Shopify';
  adjustErrors.value = {};
  adjustMessage.value = null;
}

async function adjust() {
  const row = adjusting.value;
  if (row === null || row.shopifyStock === null) return;
  adjustSaving.value = true;
  adjustErrors.value = {};
  adjustMessage.value = null;
  try {
    await $fetch('/api/stock-entries', {
      method: 'POST',
      body: { kind: 'stocktake', variantId: row.variantId, counted: row.shopifyStock, note: adjustNote.value },
    });
    adjusting.value = null;
    await refresh();
  } catch (err) {
    const { message: text, fields } = readError(err);
    adjustMessage.value = text;
    adjustErrors.value = fields;
  } finally {
    adjustSaving.value = false;
  }
}

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
      hinweis="Verbindung zum Shop, Zuordnung der Varianten über die SKU und Abruf der Bestellungen. In Shopify wird nichts geändert."
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

        <div
          class="space-y-3 rounded-[12px] border border-leinen-200/70 bg-white p-4 dark:border-leinen-800 dark:bg-leinen-900"
          style="border-width: 0.5px"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-sm font-medium">Bestellungen</p>
              <p class="text-sm text-leinen-500">
                Neue Bestellungen, Erstattungen und Stornos aus Shopify. Abgerufen bis: {{ syncedText }}
              </p>
            </div>
            <UButton icon="i-lucide-download" :loading="syncing" @click="sync">Jetzt abrufen</UButton>
          </div>

          <UAlert v-if="syncError" color="error" variant="soft" :title="syncError" />

          <template v-if="syncResult">
            <p class="text-sm">
              {{ syncResult.fetched }} Bestellungen geprüft: {{ syncResult.created }} neu, {{ syncResult.updated }} geändert,
              {{ syncResult.unchanged }} unverändert.
            </p>
            <UAlert
              v-if="syncResult.errors.length > 0"
              color="error"
              variant="soft"
              title="Nicht gebucht; der nächste Abruf versucht es erneut"
            >
              <template #description>
                <ul class="list-inside list-disc">
                  <li v-for="(e, i) in syncResult.errors" :key="i">{{ e.order }}: {{ e.message }}</li>
                </ul>
              </template>
            </UAlert>
            <UAlert v-if="syncResult.warnings.length > 0" color="warning" variant="soft" title="Hinweise">
              <template #description>
                <ul class="list-inside list-disc">
                  <li v-for="(w, i) in syncResult.warnings" :key="i">{{ w.order }}: {{ w.message }}</li>
                </ul>
              </template>
            </UAlert>
          </template>
        </div>

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
                <th class="px-4 text-right">Prüfliste</th>
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
                <td class="px-4 text-right">
                  <UButton
                    v-if="deviates(row)"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-scale"
                    class="rounded-[8px]"
                    @click="openAdjust(row)"
                  >
                    Angleichen
                  </UButton>
                </td>
              </tr>
              <tr v-if="data.rows.length === 0">
                <td colspan="6" class="px-4 py-6 text-center text-leinen-500">Keine aktiven Varianten im Dashboard.</td>
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

    <UModal v-model:open="adjustOpen" title="Bestand angleichen">
      <template #body>
        <form v-if="adjusting" class="space-y-4" @submit.prevent="adjust">
          <UAlert v-if="adjustMessage" color="error" variant="subtle" class="rounded-[12px]" :description="adjustMessage" />
          <p class="text-sm">
            <span class="font-mono text-xs">{{ adjusting.sku }}</span>: Dashboard {{ adjusting.dashboardStock }} → Shopify
            {{ adjusting.shopifyStock }}. Gebucht wird eine Inventur (Plus auf die neueste Charge, Minus nach FIFO).
          </p>
          <UFormField label="Notiz" required :error="adjustErrors.note">
            <UInput v-model="adjustNote" class="w-full" />
          </UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <UButton color="neutral" variant="ghost" class="rounded-[8px]" @click="adjusting = null">Abbrechen</UButton>
            <UButton type="submit" :loading="adjustSaving" class="rounded-[8px]">Inventur buchen</UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>

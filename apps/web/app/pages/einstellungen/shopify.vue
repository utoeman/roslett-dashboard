<script setup lang="ts">
import type { PricePlan } from '@roslett/core';
import type {
  ReceiptShopifyPushResult,
  ShopifyMatchRow,
  ShopifyPricePushResult,
  ShopifyStatus,
  ShopifyStockChangesPreview,
  ShopifySyncResult,
} from '~~/shared/types/api';

useHead({ title: 'Shopify' });

const { readError } = useApiError();
const { data, pending, error, refresh } = await useFetch<ShopifyStatus>('/api/shopify/status', { lazy: true });

const linking = ref(false);
const message = ref<string | null>(null);
const syncing = ref(false);
const syncResult = ref<ShopifySyncResult | null>(null);
const syncError = ref<string | null>(null);

const triggerText = { manual: 'per Klick', scheduled: 'automatisch', nightly: 'nächtlicher Abgleich' } as const;
const formatTime = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
// Own click first; otherwise the last run, so errors of scheduled runs show up here.
const shownResult = computed(() => syncResult.value ?? data.value?.lastRun?.result ?? null);
/** The order in the Shopify admin, to look at what the import could not book. */
const orderAdminUrl = (orderId: string | undefined) => {
  const numeric = orderId?.split('/').pop();
  return data.value?.shop && numeric ? `https://${data.value.shop}/admin/orders/${numeric}` : null;
};
const lastRunText = computed(() => {
  const run = data.value?.lastRun;
  return run ? `Letzter Abruf ${formatTime(run.at)}, ${triggerText[run.trigger]}` : null;
});

const syncedText = computed(() =>
  data.value?.ordersSyncedTo
    ? formatTime(data.value.ordersSyncedTo)
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
      body: { kind: 'stocktake', variantId: row.variantId, counted: row.shopifyStock, note: adjustNote.value, alignedWithShopify: true },
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

// Stage 2a: price and cost differences, pushed only after looking at the preview.
const { formatMoney } = useMoney();
const {
  data: pricePlan,
  pending: pricesLoading,
  error: pricesError,
  refresh: refreshPrices,
} = await useFetch<PricePlan>('/api/shopify/prices', { lazy: true });
const pushing = ref(false);
const pushResult = ref<ShopifyPricePushResult | null>(null);
const pushError = ref<string | null>(null);

async function pushPrices() {
  pushing.value = true;
  pushError.value = null;
  pushResult.value = null;
  try {
    pushResult.value = await $fetch<ShopifyPricePushResult>('/api/shopify/prices', { method: 'POST' });
    await refreshPrices();
  } catch (err) {
    pushError.value = readError(err).message;
  } finally {
    pushing.value = false;
  }
}

// Stage 4: stock changes booked in the dashboard that Shopify does not know about yet.
const {
  data: stockChanges,
  error: stockChangesError,
  refresh: refreshStockChanges,
} = await useFetch<ShopifyStockChangesPreview>('/api/shopify/stock-changes', { lazy: true });
const stockLocation = ref<string | undefined>(undefined);
const stockPushing = ref(false);
const stockResult = ref<ReceiptShopifyPushResult | null>(null);
const stockError = ref<string | null>(null);
const kindText: Record<string, string> = {
  goods_receipt: 'Zugang',
  shrinkage: 'Schwund',
  own_use: 'Eigenverbrauch',
  stocktake: 'Inventur',
  supplier_return: 'Rückgabe an Lieferant',
  reversal: 'Storno',
};
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const needsLocation = computed(() => (stockChanges.value?.locations.length ?? 0) > 1);

async function pushStock() {
  stockPushing.value = true;
  stockError.value = null;
  stockResult.value = null;
  try {
    stockResult.value = await $fetch<ReceiptShopifyPushResult>('/api/shopify/stock-changes', {
      method: 'POST',
      body: { locationId: stockLocation.value ?? null },
    });
    await Promise.all([refreshStockChanges(), refresh()]);
  } catch (err) {
    stockError.value = readError(err).message;
    // Part of it may have gone through; show what is still open.
    await refreshStockChanges();
  } finally {
    stockPushing.value = false;
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
      hinweis="Verbindung zum Shop: Varianten über die SKU zuordnen, Bestellungen abrufen, Preise und Bestandsänderungen übertragen. Geschrieben wird nur nach Klick."
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
                Neue Bestellungen, Erstattungen und Stornos aus Shopify, automatisch alle 15 Minuten. Abgerufen bis: {{ syncedText }}
              </p>
            </div>
            <UButton icon="i-lucide-download" :loading="syncing" @click="sync">Jetzt abrufen</UButton>
          </div>

          <UAlert v-if="syncError" color="error" variant="soft" :title="syncError" />

          <template v-if="shownResult">
            <p class="text-sm">
              <span v-if="lastRunText" class="text-leinen-500">{{ lastRunText }}: </span>
              {{ shownResult.fetched }} Bestellungen geprüft: {{ shownResult.created }} neu, {{ shownResult.updated }} geändert,
              {{ shownResult.unchanged }} unverändert.
            </p>
            <UAlert
              v-if="shownResult.errors.length > 0"
              color="error"
              variant="soft"
              title="Nicht gebucht; der nächste Abruf versucht es erneut"
            >
              <template #description>
                <ul class="list-inside list-disc space-y-1">
                  <li v-for="(e, i) in shownResult.errors" :key="i">
                    <strong>{{ e.order }}</strong>: {{ e.message }}
                    <ULink v-if="orderAdminUrl(e.orderId)" :to="orderAdminUrl(e.orderId)!" target="_blank" class="underline">
                      In Shopify öffnen
                    </ULink>
                  </li>
                </ul>
                <p class="mt-2">
                  Alle anderen Bestellungen werden weiter gebucht. Solange eine Meldung offen ist, lassen sich nach Shopify
                  übertragene Wareneingänge nicht löschen.
                </p>
              </template>
            </UAlert>
            <UAlert v-if="shownResult.warnings.length > 0" color="warning" variant="soft" title="Hinweise">
              <template #description>
                <ul class="list-inside list-disc">
                  <li v-for="(w, i) in shownResult.warnings" :key="i">{{ w.order }}: {{ w.message }}</li>
                </ul>
              </template>
            </UAlert>
          </template>
        </div>

        <div
          class="space-y-3 rounded-[12px] border border-leinen-200/70 bg-white p-4 dark:border-leinen-800 dark:bg-leinen-900"
          style="border-width: 0.5px"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-sm font-medium">Preise und Einstandspreise</p>
              <p class="text-sm text-leinen-500">
                Das Dashboard gibt Verkaufspreis und Einstand vor. Übertragen werden nur Abweichungen, erst nach Klick.
              </p>
            </div>
            <UButton
              icon="i-lucide-upload"
              :disabled="!pricePlan || pricePlan.changes.length === 0"
              :loading="pushing"
              @click="pushPrices"
            >
              {{ pricePlan?.changes.length ?? 0 }} Änderungen übertragen
            </UButton>
          </div>

          <p v-if="pricesLoading && !pricePlan" class="text-sm text-leinen-500">Preise werden verglichen …</p>
          <UAlert v-if="pricesError" color="error" variant="soft" :title="readError(pricesError).message" />
          <UAlert v-if="pushError" color="error" variant="soft" :title="pushError" />
          <UAlert
            v-if="pushResult"
            :color="pushResult.errors.length > 0 ? 'warning' : 'success'"
            variant="soft"
            :title="`${pushResult.prices} Preise und ${pushResult.costs} Einstandspreise übertragen.`"
          >
            <template v-if="pushResult.errors.length > 0" #description>
              <ul class="list-inside list-disc">
                <li v-for="(e, i) in pushResult.errors" :key="i">{{ e.sku }}: {{ e.message }}</li>
              </ul>
            </template>
          </UAlert>

          <table v-if="pricePlan && pricePlan.changes.length > 0" class="ros-tabelle w-full text-sm">
            <thead class="text-left text-xs font-medium uppercase tracking-wide text-leinen-500">
              <tr>
                <th class="px-2">SKU</th>
                <th class="px-2 text-right">Preis Shopify → Dashboard</th>
                <th class="px-2 text-right">Einstand Shopify → Dashboard</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in pricePlan.changes" :key="c.variantId">
                <td class="px-2 font-mono text-xs">{{ c.sku }}</td>
                <td class="zahl px-2">{{ c.price ? `${formatMoney(c.price.from)} → ${formatMoney(c.price.to)}` : '–' }}</td>
                <td class="zahl px-2">
                  {{ c.cost ? `${c.cost.from === null ? 'leer' : formatMoney(c.cost.from)} → ${formatMoney(c.cost.to)}` : '–' }}
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else-if="pricePlan" class="text-sm text-leinen-500">Preise und Einstandspreise stimmen überein.</p>
          <p v-if="pricePlan && pricePlan.missingPrice.length > 0" class="text-sm text-roswarning-700">
            Ohne Preis im Dashboard (Shopify-Preis bleibt): {{ pricePlan.missingPrice.join(', ') }}
          </p>
        </div>

        <div
          class="space-y-3 rounded-[12px] border border-leinen-200/70 bg-white p-4 dark:border-leinen-800 dark:bg-leinen-900"
          style="border-width: 0.5px"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-sm font-medium">Offene Bestandsänderungen</p>
              <p class="text-sm text-leinen-500">
                Zugänge, Schwund, Eigenverbrauch, Inventur und Rückgaben, die Shopify noch nicht kennt. Jede Buchung wird
                einmal übertragen; Verkäufe und Retouren kommen aus Shopify.
              </p>
            </div>
            <div class="flex items-center gap-2">
              <USelectMenu
                v-if="needsLocation"
                v-model="stockLocation"
                :items="(stockChanges?.locations ?? []).map((l) => ({ label: l.name, value: l.id }))"
                value-key="value"
                placeholder="Lagerort"
                class="w-44"
              />
              <UButton
                icon="i-lucide-upload"
                :disabled="!stockChanges || stockChanges.lines.length === 0 || (needsLocation && !stockLocation)"
                :loading="stockPushing"
                @click="pushStock"
              >
                {{ stockChanges?.lines.length ?? 0 }} Varianten übertragen
              </UButton>
            </div>
          </div>
          <UAlert v-if="stockChangesError" color="error" variant="soft" :title="readError(stockChangesError).message" />
          <UAlert v-if="stockError" color="error" variant="soft" :title="stockError" />
          <UAlert
            v-if="stockResult"
            color="success"
            variant="soft"
            :title="`In Shopify gebucht (${stockResult.location})`"
            :description="
              stockResult.lines.map((l) => `${l.sku} ${signed(l.delta)}`).join(', ') +
              (stockResult.unlinked.length > 0 ? ` – übersprungen, nicht verknüpft: ${stockResult.unlinked.join(', ')}` : '')
            "
          />
          <ShopifyHinweise v-if="stockChanges" :unlinked="stockChanges.unlinked" :lines="stockChanges.lines" />
          <table v-if="stockChanges && stockChanges.lines.length > 0" class="ros-tabelle w-full text-sm">
            <thead class="text-left text-xs font-medium uppercase tracking-wide text-leinen-500">
              <tr>
                <th class="px-2">SKU</th>
                <th class="px-2">Buchungen</th>
                <th class="px-2 text-right">Änderung</th>
                <th class="px-2 text-right">Shopify</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in stockChanges.lines" :key="l.sku">
                <td class="px-2 font-mono text-xs">{{ l.sku }}</td>
                <td class="px-2 text-leinen-600">
                  {{ l.entries.map((e) => `${kindText[e.kind] ?? e.kind} ${signed(e.quantity)} (${new Date(e.postedAt).toLocaleDateString('de-DE')})`).join(', ') }}
                </td>
                <td class="zahl px-2">{{ signed(l.delta) }}</td>
                <td class="zahl px-2">
                  {{ l.shopifyStock === null ? '–' : `${l.shopifyStock} → ${l.shopifyStock + l.delta}` }}
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else-if="stockChanges && stockChanges.unlinked.length === 0" class="text-sm text-leinen-500">
            Shopify kennt alle Bestandsänderungen.
          </p>
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

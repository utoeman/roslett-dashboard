<script setup lang="ts">
import { MoneyError, convertToEur, parseMoney } from '@roslett/core';
import type {
  AdditionalCost,
  GoodsReceipt,
  List,
  Product,
  ReceiptDeletionPreview,
  ReceiptPosition,
  ReceiptShopifyPreview,
  ReceiptShopifyPushResult,
} from '~~/shared/types/api';

const route = useRoute();
const id = computed(() => String(route.params.id));

const { formatMoney, formatForeign, formatDate, toInput } = useMoney();
const { readError } = useApiError();

const { data, pending, error, refresh } = await useFetch<GoodsReceipt>(() => `/api/goods-receipts/${id.value}`);
useHead({ title: () => data.value?.number ?? 'Wareneingang' });

const { data: products } = await useFetch<List<Product>>('/api/products', { query: { limit: 500 } });
const variantOptions = computed(
  () =>
    products.value?.items.flatMap((p) =>
      p.variants.map((v) => ({ label: `${v.sku} · ${p.name} ${v.label}`, value: v.id })),
    ) ?? [],
);

const today = () => new Date().toISOString().slice(0, 10);
// Plain string: Nuxt's typed routes recurse too deep on template-literal URLs.
const api = (suffix = ''): string => `/api/goods-receipts/${id.value}${suffix}`;
const isDraft = computed(() => data.value?.state === 'draft');
// A production is a receipt with the sewing wage as unit price.
const isProduction = computed(() => data.value?.kind === 'production');
const priceLabel = computed(() => (isProduction.value ? 'Nählohn' : 'EK'));
const message = ref<string | null>(null);
const fieldErrors = ref<Record<string, string>>({});
const saving = ref(false);

// `unknown` on purpose: comparing $fetch's typed response against Promise<…> overflows the checker.
async function run(action: () => unknown, onDone?: () => void) {
  saving.value = true;
  message.value = null;
  fieldErrors.value = {};
  try {
    await action();
    onDone?.();
    await refresh();
  } catch (err) {
    const { message: text, fields } = readError(err);
    message.value = text;
    fieldErrors.value = fields;
  } finally {
    saving.value = false;
  }
}

// --- Delete ----------------------------------------------------------------
// Drafts go at once (G29); a posted receipt only after a preview and typing its number (G32).
const deleteOpen = ref(false);
const deleteBusy = ref(false);
const deleteMessage = ref<string | null>(null);
const deletePreview = ref<ReceiptDeletionPreview | null>(null);
const deleteConfirm = ref('');
const deleteAllowed = computed(
  () =>
    isDraft.value ||
    (deletePreview.value !== null &&
      deletePreview.value.blockedBy.length === 0 &&
      deleteConfirm.value.trim() === deletePreview.value.number),
);

let deleteRequest = 0;

async function askDelete() {
  const request = ++deleteRequest;
  deleteMessage.value = null;
  deletePreview.value = null;
  deleteConfirm.value = '';
  deleteOpen.value = true;
  if (isDraft.value) return;
  deleteBusy.value = true;
  try {
    const preview = await $fetch<ReceiptDeletionPreview>(api('/deletion'));
    // A dialog closed and opened again meanwhile has its own request.
    if (request === deleteRequest) deletePreview.value = preview;
  } catch (err) {
    if (request === deleteRequest) deleteMessage.value = readError(err).message;
  } finally {
    if (request === deleteRequest) deleteBusy.value = false;
  }
}

async function confirmDelete() {
  deleteBusy.value = true;
  deleteMessage.value = null;
  try {
    await $fetch(api(), { method: 'DELETE', body: isDraft.value ? undefined : { confirm: deleteConfirm.value } });
    deleteOpen.value = false;
    await navigateTo('/wareneingang');
  } catch (err) {
    deleteMessage.value = readError(err).message;
    // The attempt may have changed what Shopify still gets back.
    if (!isDraft.value) {
      deletePreview.value = await $fetch<ReceiptDeletionPreview>(api('/deletion')).catch(() => deletePreview.value);
    }
  } finally {
    deleteBusy.value = false;
  }
}

const editingHeader = ref(false);
const header = reactive({ invoiceNumber: '', invoiceDate: '', currency: '', manualRate: false, exchangeRate: '' });

function openHeader() {
  if (!data.value) return;
  Object.assign(header, {
    invoiceNumber: data.value.invoiceNumber ?? '',
    invoiceDate: data.value.invoiceDate,
    currency: data.value.currency,
    manualRate: data.value.exchangeRateSource === 'manual',
    exchangeRate: String(data.value.exchangeRate).replace('.', ','),
  });
  editingHeader.value = true;
}

function saveHeader() {
  return run(
    () =>
      $fetch(api(), {
        method: 'PATCH',
        body: {
          invoiceNumber: header.invoiceNumber || null,
          invoiceDate: header.invoiceDate,
          currency: header.currency,
          // null asks the server for the ECB rate of the invoice date.
          exchangeRate: header.manualRate ? header.exchangeRate.replace(',', '.') : null,
        },
      }),
    () => (editingHeader.value = false),
  );
}

// --- Positions (drafts) ---------------------------------------------------
type Row = { variantId?: string; quantityOrdered: number; unitPrice: string; note: string };
const rows = ref<Row[]>([]);
/** Saved positions show as the list below; the editor opens on demand or while there are none. */
const editingPositions = ref(false);
const showPositionEditor = computed(() => isDraft.value && (editingPositions.value || data.value?.positions.length === 0));

function resetRows() {
  const receipt = data.value;
  rows.value =
    receipt?.positions.map((p) => ({
      variantId: p.variant.id,
      quantityOrdered: p.quantityOrdered,
      unitPrice: toInput(p.unitPriceForeign),
      note: p.note ?? '',
    })) ?? [];
  if (receipt?.state === 'draft' && rows.value.length === 0) addRow();
  loadedRows = JSON.stringify(rows.value);
}

/** Rows as last loaded; a difference means unsaved edits in the editor. */
let loadedRows = JSON.stringify(rows.value);
const positionsDirty = () => JSON.stringify(rows.value) !== loadedRows;

// Reloads after other actions (header, additional costs) must not discard unsaved positions.
watch(data, () => (positionsDirty() ? undefined : resetRows()), { immediate: true });

function cancelPositions() {
  editingPositions.value = false;
  fieldErrors.value = {};
  resetRows();
}

function addRow() {
  rows.value.push({ variantId: undefined, quantityOrdered: 1, unitPrice: '', note: '' });
}

/** Unit price in minor units, or null while the input is empty or invalid. */
function unitMinor(input: string): number | null {
  if (input.trim() === '') return null;
  try {
    return parseMoney(input);
  } catch (error) {
    if (error instanceof MoneyError) return null;
    throw error;
  }
}

/** EUR preview while typing, converted like the server does when saving. */
const toEur = (minor: number) => convertToEur(minor, data.value?.exchangeRate ?? 1);

function rowTotal(row: Row): number | null {
  const unit = unitMinor(row.unitPrice);
  return unit === null || !Number.isFinite(row.quantityOrdered) ? null : unit * row.quantityOrdered;
}

/** Line total as on the supplier invoice, plus EUR for foreign currencies. */
function formatTotal(minor: number | null): string {
  if (minor === null || !data.value) return '–';
  const foreign = formatForeign(minor, data.value.currency);
  return data.value.currency === 'EUR' ? foreign : `${foreign} ≈ ${formatMoney(toEur(minor))}`;
}

const draftTotal = computed(() => rows.value.reduce((sum, row) => sum + (rowTotal(row) ?? 0), 0));

/** Per-row messages of the positions form, e.g. "Position 2 · EK: Pflichtfeld." */
const positionErrors = computed(() => {
  const fieldNames: Record<string, string> = { variantId: 'Variante', quantityOrdered: 'Menge', unitPrice: priceLabel.value };
  return Object.entries(fieldErrors.value).flatMap(([key, text]) => {
    const match = /^positions\.(\d+)\.(\w+)$/.exec(key);
    if (!match) return [];
    return [`Position ${Number(match[1]) + 1} · ${fieldNames[match[2] ?? ''] ?? match[2]}: ${text}`];
  });
});

function savePositions() {
  return run(() =>
    $fetch(api(), {
      method: 'PATCH',
      body: {
        positions: rows.value
          .filter((r) => r.variantId)
          .map((r) => ({
            variantId: r.variantId,
            quantityOrdered: r.quantityOrdered,
            unitPrice: r.unitPrice,
            note: r.note || null,
          })),
      },
    }),
    () => {
      editingPositions.value = false;
      // Saved: the reload may replace the rows with the server's version.
      loadedRows = JSON.stringify(rows.value);
    },
  );
}

// --- Additional costs -----------------------------------------------------
const kindLabels: Record<AdditionalCost['kind'], string> = {
  freight: 'Fracht',
  customs: 'Zoll',
  fabric: 'Stoff',
  accessories: 'Zubehör',
  other: 'Sonstiges',
  credit: 'Gutschrift',
};
const productionOnly = new Set<string>(['fabric', 'accessories']);
const kindOptions = computed(() =>
  Object.entries(kindLabels)
    .filter(([value]) => isProduction.value || !productionOnly.has(value))
    .map(([value, label]) => ({ value, label })),
);
const methodOptions = [
  { label: 'nach Warenwert', value: 'value' },
  { label: 'nach Stückzahl', value: 'quantity' },
];
const costForm = reactive({ kind: 'freight', amount: '', distributionMethod: 'value', incurredOn: today(), note: '' });

function addCost() {
  return run(
    () => $fetch(api('/costs'), { method: 'POST', body: { ...costForm, note: costForm.note || null } }),
    () => Object.assign(costForm, { kind: 'freight', amount: '', distributionMethod: 'value', incurredOn: today(), note: '' }),
  );
}

// --- Receiving --------------------------------------------------------------
const receiveOpen = ref(false);
const receive = reactive({ postedAt: today(), quantities: {} as Record<string, number> });
const open = (p: ReceiptPosition) => Math.max(0, p.quantityOrdered - p.delivered);
const canReceive = computed(() => !!data.value?.positions.length && data.value.deliveryState !== 'complete');

function openReceive() {
  if (!data.value) return;
  message.value = null;
  fieldErrors.value = {};
  receive.postedAt = today();
  receive.quantities = Object.fromEntries(data.value.positions.map((p) => [p.id, open(p)]));
  receiveOpen.value = true;
}

const receiveTotal = computed(() => Object.values(receive.quantities).reduce((s, q) => s + (Number(q) || 0), 0));

function submitReceive() {
  return run(
    () =>
      $fetch(api('/receive'), {
        method: 'POST',
        body: {
          postedAt: receive.postedAt,
          lines: Object.entries(receive.quantities)
            .filter(([, q]) => Number(q) > 0)
            .map(([batchId, quantity]) => ({ batchId, quantity: Number(quantity) })),
        },
      }),
    () => (receiveOpen.value = false),
  );
}

// --- Shopify (G16) ----------------------------------------------------------
const shopifyOpen = ref(false);
const shopifyLoading = ref(false);
const shopifyPreview = ref<ReceiptShopifyPreview | null>(null);
const shopifyLocation = ref<string | undefined>(undefined);
const shopifyMessage = ref<string | null>(null);
const shopifyDone = ref<ReceiptShopifyPushResult | null>(null);

async function openShopify() {
  shopifyOpen.value = true;
  shopifyLoading.value = true;
  shopifyMessage.value = null;
  shopifyDone.value = null;
  shopifyPreview.value = null;
  try {
    shopifyPreview.value = await $fetch<ReceiptShopifyPreview>(api('/shopify'));
    shopifyLocation.value = shopifyPreview.value.locations.length === 1 ? shopifyPreview.value.locations[0]?.id : undefined;
  } catch (err) {
    shopifyMessage.value = readError(err).message;
  } finally {
    shopifyLoading.value = false;
  }
}

async function pushShopify() {
  shopifyLoading.value = true;
  shopifyMessage.value = null;
  try {
    shopifyDone.value = await $fetch<ReceiptShopifyPushResult>(api('/shopify'), {
      method: 'POST',
      body: { locationId: shopifyLocation.value ?? null },
    });
    shopifyPreview.value = null;
  } catch (err) {
    shopifyMessage.value = readError(err).message;
  } finally {
    shopifyLoading.value = false;
  }
}

const stateBadge = computed(() => {
  if (!data.value) return { label: '', color: 'neutral' as const };
  if (data.value.state === 'draft') return { label: 'Entwurf', color: 'neutral' as const };
  return {
    complete: { label: 'vollständig', color: 'success' as const },
    partial: { label: 'teilgeliefert', color: 'info' as const },
    open: { label: 'offen', color: 'warning' as const },
  }[data.value.deliveryState];
});
const positionBadge = (p: ReceiptPosition) =>
  p.delivered > p.quantityOrdered
    ? { label: 'Mehrlieferung', color: 'info' as const }
    : p.deliveryState === 'complete'
      ? { label: 'vollständig', color: 'success' as const }
      : { label: `offen ${open(p)}`, color: 'warning' as const };
</script>

<template>
  <div>
    <div v-if="error" class="p-6">
      <UAlert color="error" variant="subtle" class="rounded-[12px]" title="Wareneingang nicht gefunden" />
      <UButton to="/wareneingang" variant="ghost" class="mt-4 rounded-[8px]" icon="i-lucide-arrow-left">
        Zur Liste
      </UButton>
    </div>

    <div v-else-if="pending && !data" class="p-6 text-sm text-leinen-500">Wird geladen …</div>

    <div v-else-if="data">
      <SeitenKopf :titel="data.number" :hinweis="`${data.supplier.name} · Rechnung vom ${formatDate(data.invoiceDate)}`">
        <template #aktionen>
          <UBadge :color="stateBadge.color" variant="subtle" class="rounded-[8px]">{{ stateBadge.label }}</UBadge>
          <UButton to="/wareneingang" variant="ghost" color="neutral" size="sm" icon="i-lucide-arrow-left" class="rounded-[8px]">
            Alle
          </UButton>
          <UButton
            icon="i-lucide-trash-2"
            size="sm"
            variant="ghost"
            color="error"
            class="rounded-[8px]"
            :disabled="saving"
            @click="askDelete"
          >
            {{ isDraft ? 'Entwurf löschen' : 'Löschen' }}
          </UButton>
          <UButton v-if="canReceive" icon="i-lucide-package-check" size="sm" class="rounded-[8px]" @click="openReceive">
            Zugang buchen
          </UButton>
          <UButton
            v-if="!isDraft"
            icon="i-lucide-upload"
            size="sm"
            variant="outline"
            color="neutral"
            class="rounded-[8px]"
            @click="openShopify"
          >
            Nach Shopify übertragen
          </UButton>
        </template>
      </SeitenKopf>

      <div class="grid gap-6 px-6 py-4 lg:grid-cols-3">
        <div class="min-w-0 space-y-6 lg:col-span-2">
          <UAlert
            v-if="message && !receiveOpen"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            class="rounded-[12px]"
            :description="message"
          />

          <!-- Invoice -->
          <section class="rounded-[12px] border border-leinen-200/70 bg-white p-4" style="border-width: 0.5px">
            <div class="mb-3 flex items-center justify-between">
              <h2 class="text-sm font-semibold">Rechnung</h2>
              <UButton
                v-if="isDraft && !editingHeader"
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-lucide-pencil"
                class="rounded-[8px]"
                @click="openHeader"
              >
                Bearbeiten
              </UButton>
            </div>

            <form v-if="editingHeader" class="space-y-3" @submit.prevent="saveHeader">
              <div class="grid gap-3 sm:grid-cols-3">
                <UFormField label="Rechnungsnummer" :error="fieldErrors.invoiceNumber">
                  <UInput v-model="header.invoiceNumber" class="w-full" />
                </UFormField>
                <UFormField label="Rechnungsdatum" :error="fieldErrors.invoiceDate">
                  <UInput v-model="header.invoiceDate" type="date" class="w-full" />
                </UFormField>
                <UFormField label="Währung" :error="fieldErrors.currency">
                  <WaehrungAuswahl v-model="header.currency" />
                </UFormField>
              </div>
              <UCheckbox v-model="header.manualRate" label="Kurs von Hand statt EZB-Referenzkurs" />
              <UFormField
                v-if="header.manualRate"
                label="Kurs"
                :error="fieldErrors.exchangeRate"
                :help="`Wie viele ${header.currency} entsprechen 1 EUR.`"
              >
                <UInput v-model="header.exchangeRate" class="w-48 font-mono" />
              </UFormField>
              <div class="flex justify-end gap-2">
                <UButton color="neutral" variant="ghost" class="rounded-[8px]" @click="editingHeader = false">
                  Abbrechen
                </UButton>
                <UButton type="submit" :loading="saving" class="rounded-[8px]">Speichern</UButton>
              </div>
            </form>

            <dl v-else class="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt class="text-xs text-leinen-500">{{ isProduction ? 'Näherei' : 'Lieferant' }}</dt>
                <dd>{{ data.supplier.name }}</dd>
              </div>
              <div>
                <dt class="text-xs text-leinen-500">Rechnungsnummer</dt>
                <dd>{{ data.invoiceNumber ?? '–' }}</dd>
              </div>
              <div>
                <dt class="text-xs text-leinen-500">Rechnungsdatum</dt>
                <dd>{{ formatDate(data.invoiceDate) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-leinen-500">Währung und Kurs</dt>
                <dd v-if="data.currency === 'EUR'">EUR</dd>
                <dd v-else>
                  <span class="font-mono">1 EUR = {{ String(data.exchangeRate).replace('.', ',') }} {{ data.currency }}</span>
                  <span class="text-xs text-leinen-500">
                    · {{ data.exchangeRateSource === 'ecb' ? 'EZB-Referenzkurs, letzter Handelstag bis Rechnungsdatum' : 'von Hand' }}
                  </span>
                </dd>
              </div>
            </dl>
          </section>

          <!-- Positions -->
          <section class="overflow-x-auto rounded-[12px] border border-leinen-200/70 bg-white" style="border-width: 0.5px">
            <div class="flex items-center justify-between px-4 py-3">
              <h2 class="text-sm font-semibold">
                Positionen <span class="ml-1 font-normal text-leinen-500">{{ data.positions.length }}</span>
              </h2>
              <p v-if="showPositionEditor" class="text-xs text-leinen-500">
                Einstand und Nebenkostenanteil erscheinen nach dem Speichern.
              </p>
              <UButton
                v-else-if="isDraft"
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-lucide-pencil"
                class="rounded-[8px]"
                @click="editingPositions = true"
              >
                Bearbeiten
              </UButton>
            </div>

            <form v-if="showPositionEditor" @submit.prevent="savePositions">
              <!-- Fixed layout: a long product name must not squeeze the number columns; the select truncates it. -->
              <table class="ros-tabelle w-full min-w-[44rem] table-fixed text-sm">
                <thead
                  class="border-y border-leinen-200/70 bg-leinen-50/60 text-left text-xs font-medium uppercase tracking-wide text-leinen-500"
                >
                  <tr>
                    <th class="px-4">Variante</th>
                    <th class="w-28 px-4 text-right">Menge</th>
                    <th class="w-40 px-4 text-right">{{ priceLabel }} netto je Stück ({{ data.currency }})</th>
                    <th v-if="data.currency !== 'EUR'" class="w-32 px-4 text-right">≈ EUR je Stück</th>
                    <th class="w-32 px-4 text-right">Summe</th>
                    <th class="w-10 px-2" />
                  </tr>
                </thead>
                <tbody class="divide-y divide-leinen-200/60">
                  <tr v-for="(row, index) in rows" :key="index">
                    <td class="px-4 py-2">
                      <USelectMenu
                        v-model="row.variantId"
                        :items="variantOptions"
                        value-key="value"
                        placeholder="SKU oder Produkt suchen"
                        class="w-full min-w-0"
                        :aria-label="`Variante Position ${index + 1}`"
                        :color="fieldErrors[`positions.${index}.variantId`] ? 'error' : undefined"
                      />
                    </td>
                    <td class="px-4 py-2">
                      <UInput
                        v-model.number="row.quantityOrdered"
                        type="number"
                        min="1"
                        class="w-full"
                        :aria-label="`Menge Position ${index + 1}`"
                        :color="fieldErrors[`positions.${index}.quantityOrdered`] ? 'error' : undefined"
                      />
                    </td>
                    <td class="px-4 py-2">
                      <BetragFeld
                        v-model="row.unitPrice"
                        class="w-full"
                        :aria-label="`${priceLabel} Position ${index + 1}`"
                        :color="fieldErrors[`positions.${index}.unitPrice`] ? 'error' : undefined"
                      />
                    </td>
                    <td v-if="data.currency !== 'EUR'" class="zahl px-4 text-leinen-500">
                      {{ unitMinor(row.unitPrice) === null ? '–' : formatMoney(toEur(unitMinor(row.unitPrice) ?? 0)) }}
                    </td>
                    <td class="zahl px-4">{{ formatTotal(rowTotal(row)) }}</td>
                    <td class="px-2">
                      <UButton
                        size="xs"
                        variant="ghost"
                        color="neutral"
                        icon="i-lucide-x"
                        :aria-label="`Position ${index + 1} entfernen`"
                        @click="rows.splice(index, 1)"
                      />
                    </td>
                  </tr>
                </tbody>
                <tfoot v-if="rows.length > 1" class="border-t border-leinen-200/70">
                  <tr>
                    <td :colspan="data.currency !== 'EUR' ? 4 : 3" class="px-4 text-right text-xs text-leinen-500">
                      Summe aller Positionen
                    </td>
                    <td class="zahl px-4 font-medium">{{ formatTotal(draftTotal) }}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
              <ul v-if="positionErrors.length" class="space-y-0.5 px-4 pt-3 text-xs text-red-700">
                <li v-for="text in positionErrors" :key="text">{{ text }}</li>
              </ul>
              <div class="flex flex-wrap justify-between gap-2 px-4 py-3">
                <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-plus" class="rounded-[8px]" @click="addRow">
                  Position hinzufügen
                </UButton>
                <div class="flex gap-2">
                  <UButton
                    v-if="data.positions.length"
                    size="sm"
                    variant="ghost"
                    color="neutral"
                    class="rounded-[8px]"
                    @click="cancelPositions"
                  >
                    Abbrechen
                  </UButton>
                  <UButton type="submit" size="sm" :loading="saving" class="rounded-[8px]">Positionen speichern</UButton>
                </div>
              </div>
            </form>

            <table v-if="data.positions.length" class="ros-tabelle w-full min-w-[44rem] text-sm">
              <thead
                class="border-y border-leinen-200/70 bg-leinen-50/60 text-left text-xs font-medium uppercase tracking-wide text-leinen-500"
              >
                <tr>
                  <th class="px-4">Variante</th>
                  <th class="px-4 text-right">Menge</th>
                  <th class="px-4 text-right">{{ priceLabel }}/Stk netto</th>
                  <th class="px-4 text-right">{{ priceLabel }}/Stk EUR</th>
                  <th class="px-4 text-right">NK/Stk</th>
                  <th class="px-4 text-right">Einstand/Stk</th>
                  <th v-if="!isDraft" class="px-4">Lieferung</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-leinen-200/60">
                <tr v-for="p in data.positions" :key="p.id">
                  <td class="px-4">
                    <NuxtLink :to="`/produkte/${p.variant.productId}`" class="hover:text-ros-600">
                      {{ p.variant.productName }} {{ p.variant.label }}
                    </NuxtLink>
                    <div class="font-mono text-xs text-leinen-500">{{ p.variant.sku }}</div>
                  </td>
                  <td class="zahl px-4">{{ p.quantityOrdered }}</td>
                  <td class="zahl px-4">{{ formatForeign(p.unitPriceForeign, data.currency) }}</td>
                  <td class="zahl px-4">{{ formatMoney(p.unitPriceEur) }}</td>
                  <td class="zahl px-4 text-leinen-500">{{ formatMoney(Math.round(p.additionalCostsEur / p.quantityOrdered)) }}</td>
                  <td class="zahl px-4 font-medium">{{ formatMoney(p.landedCostEur) }}</td>
                  <td v-if="!isDraft" class="px-4">
                    <span class="mr-2 font-mono text-xs">{{ p.delivered }}/{{ p.quantityOrdered }}</span>
                    <UBadge size="sm" :color="positionBadge(p).color" variant="subtle" class="rounded-[8px]">
                      {{ positionBadge(p).label }}
                    </UBadge>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <!-- Additional costs -->
          <section class="overflow-x-auto rounded-[12px] border border-leinen-200/70 bg-white" style="border-width: 0.5px">
            <div class="px-4 py-3">
              <h2 class="text-sm font-semibold">Nebenkosten</h2>
              <p class="mt-0.5 text-xs text-leinen-500">
                {{ isProduction ? 'Stoff, Zubehör, Fracht und Zoll' : 'Fracht, Zoll und Gutschriften' }} verteilen sich auf alle Positionen – auch nachträglich, der Einstand
                ändert sich dann rückwirkend. Einfuhrumsatzsteuer gehört nicht hierher.
              </p>
            </div>
            <table v-if="data.additionalCosts.length" class="ros-tabelle w-full text-sm">
              <tbody class="divide-y divide-leinen-200/60 border-t border-leinen-200/70">
                <tr v-for="c in data.additionalCosts" :key="c.id">
                  <td class="px-4">{{ kindLabels[c.kind] }}</td>
                  <td class="px-4 text-leinen-500">{{ c.note ?? '' }}</td>
                  <td class="px-4 text-leinen-500">
                    {{ c.distributionMethod === 'value' ? 'nach Warenwert' : 'nach Stückzahl' }} · {{ formatDate(c.incurredOn) }}
                  </td>
                  <td class="zahl px-4">{{ formatMoney(c.amountEur) }}</td>
                </tr>
              </tbody>
            </table>
            <form class="grid gap-3 border-t border-leinen-200/70 p-4 sm:grid-cols-6" @submit.prevent="addCost">
              <UFormField label="Art" class="sm:col-span-1">
                <USelectMenu v-model="costForm.kind" :items="kindOptions" value-key="value" class="w-full" />
              </UFormField>
              <UFormField label="Betrag EUR" :error="fieldErrors.amount" class="sm:col-span-1">
                <BetragFeld v-model="costForm.amount" class="w-full" />
              </UFormField>
              <UFormField label="Verteilung" class="sm:col-span-2">
                <USelectMenu v-model="costForm.distributionMethod" :items="methodOptions" value-key="value" class="w-full" />
              </UFormField>
              <UFormField label="Datum" class="sm:col-span-2">
                <UInput v-model="costForm.incurredOn" type="date" class="w-full" />
              </UFormField>
              <UFormField label="Notiz" class="sm:col-span-4">
                <UInput v-model="costForm.note" class="w-full" placeholder="z. B. Zollbescheid vom …" />
              </UFormField>
              <div class="flex items-end sm:col-span-2">
                <UButton type="submit" :loading="saving" icon="i-lucide-plus" block class="rounded-[8px]">
                  Hinzufügen
                </UButton>
              </div>
            </form>
          </section>

          <!-- Prices once the landed cost is known (G31) -->
          <PreiseFestlegen v-if="!isDraft && data.positions.length > 0" :positions="data.positions" @shopify="openShopify" />
        </div>

        <!-- Summary -->
        <aside class="h-fit rounded-[12px] border border-leinen-200/70 bg-white p-4 text-sm lg:sticky lg:top-4" style="border-width: 0.5px">
          <h2 class="mb-3 text-sm font-semibold">Zusammenfassung</h2>
          <dl class="space-y-2">
            <div class="flex justify-between">
              <dt class="text-leinen-500">Positionen · Stück</dt>
              <dd class="font-mono">{{ data.positions.length }} · {{ data.totals.quantityOrdered }}</dd>
            </div>
            <div v-if="!isDraft" class="flex justify-between">
              <dt class="text-leinen-500">Geliefert</dt>
              <dd class="font-mono">{{ data.totals.delivered }} / {{ data.totals.quantityOrdered }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-leinen-500">Warenwert</dt>
              <dd class="font-mono">{{ formatMoney(data.totals.goodsValueEur) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-leinen-500">Nebenkosten</dt>
              <dd class="font-mono">{{ formatMoney(data.totals.additionalCostsEur) }}</dd>
            </div>
            <div class="flex justify-between border-t border-leinen-200/70 pt-2 font-medium">
              <dt>Einstand gesamt</dt>
              <dd class="font-mono">{{ formatMoney(data.totals.landedTotalEur) }}</dd>
            </div>
          </dl>
          <UButton v-if="canReceive" icon="i-lucide-package-check" block class="mt-4 rounded-[8px]" @click="openReceive">
            Zugang buchen
          </UButton>
        </aside>
      </div>

      <UModal v-model:open="receiveOpen" title="Zugang buchen">
        <template #body>
          <form class="space-y-4" @submit.prevent="submitReceive">
            <UAlert
              v-if="message"
              color="error"
              variant="subtle"
              icon="i-lucide-circle-alert"
              class="rounded-[12px]"
              :description="message"
            />
            <p class="text-sm text-leinen-500">
              Gelieferte Mengen je Position. Vorbelegt ist der offene Rest; weniger bucht eine Teillieferung.
            </p>
            <div v-for="p in data.positions" :key="p.id" class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <div class="truncate text-sm">{{ p.variant.productName }} {{ p.variant.label }}</div>
                <div class="font-mono text-xs text-leinen-500">
                  {{ p.variant.sku }} · offen {{ open(p) }} von {{ p.quantityOrdered }}
                </div>
              </div>
              <UInput
                v-model.number="receive.quantities[p.id]"
                type="number"
                min="0"
                class="w-24"
                :aria-label="`Gelieferte Menge ${p.variant.sku}`"
              />
            </div>
            <UFormField label="Eingangsdatum" :error="fieldErrors.postedAt">
              <UInput v-model="receive.postedAt" type="date" class="w-48" />
            </UFormField>
            <div class="flex justify-end gap-2 pt-2">
              <UButton color="neutral" variant="ghost" class="rounded-[8px]" @click="receiveOpen = false">
                Abbrechen
              </UButton>
              <UButton type="submit" :loading="saving" :disabled="receiveTotal === 0" class="rounded-[8px]">
                {{ receiveTotal }} Stück buchen
              </UButton>
            </div>
          </form>
        </template>
      </UModal>

      <UModal v-model:open="shopifyOpen" title="Zugang nach Shopify übertragen">
        <template #body>
          <div class="space-y-4">
            <UAlert v-if="shopifyMessage" color="error" variant="subtle" class="rounded-[12px]" :description="shopifyMessage" />
            <p v-if="shopifyLoading && !shopifyPreview" class="text-sm text-leinen-500">Shopify wird abgefragt …</p>

            <UAlert
              v-if="shopifyDone"
              color="success"
              variant="subtle"
              class="rounded-[12px]"
              :title="`In Shopify gebucht (${shopifyDone.location})`"
              :description="
                shopifyDone.lines.map((l) => `${l.sku} +${l.delta}`).join(', ') +
                (shopifyDone.unlinked.length > 0 ? ` – übersprungen, nicht verknüpft: ${shopifyDone.unlinked.join(', ')}` : '')
              "
            />

            <template v-if="shopifyPreview">
              <UAlert
                v-if="shopifyPreview.unlinked.length > 0"
                color="warning"
                variant="subtle"
                class="rounded-[12px]"
                :title="`Nicht mit Shopify verknüpft, wird übersprungen: ${shopifyPreview.unlinked.join(', ')}`"
                description="Bitte das Produkt erst nach Shopify übertragen oder verknüpfen; die Buchungen bleiben offen."
              />
              <p v-if="shopifyPreview.lines.length === 0 && shopifyPreview.unlinked.length === 0" class="text-sm text-leinen-500">
                Alle gebuchten Zugänge dieses Belegs sind schon in Shopify.
              </p>
              <template v-else-if="shopifyPreview.lines.length > 0">
                <p class="text-sm text-leinen-500">
                  Gebuchte Zugänge, die noch nicht in Shopify sind. Shopify erhöht den Bestand um die Menge; jede Buchung
                  wird nur einmal übertragen.
                </p>
                <ul class="space-y-1 text-sm">
                  <li v-for="l in shopifyPreview.lines" :key="l.sku" class="flex justify-between gap-3">
                    <span class="font-mono text-xs">{{ l.sku }}</span>
                    <span class="tabular-nums">
                      +{{ l.delta }}<template v-if="l.shopifyStock !== null">, Shopify {{ l.shopifyStock }} → {{ l.shopifyStock + l.delta }}</template>
                    </span>
                  </li>
                </ul>
                <UFormField v-if="shopifyPreview.locations.length > 1" label="Lagerort" required>
                  <USelectMenu
                    v-model="shopifyLocation"
                    :items="shopifyPreview.locations.map((l) => ({ label: l.name, value: l.id }))"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>
              </template>
            </template>

            <div class="flex justify-end gap-2 pt-2">
              <UButton color="neutral" variant="ghost" class="rounded-[8px]" @click="shopifyOpen = false">Schließen</UButton>
              <UButton
                v-if="shopifyPreview && shopifyPreview.lines.length > 0"
                :loading="shopifyLoading"
                :disabled="shopifyLocation === undefined"
                class="rounded-[8px]"
                @click="pushShopify"
              >
                Übertragen
              </UButton>
            </div>
          </div>
        </template>
      </UModal>

      <UModal v-model:open="deleteOpen" :title="isDraft ? 'Entwurf löschen' : 'Gebuchten Wareneingang löschen'">
        <template #body>
          <div class="space-y-4">
            <UAlert v-if="deleteMessage" color="error" variant="subtle" class="rounded-[12px]" :description="deleteMessage" />
            <p v-if="isDraft" class="text-sm">
              {{ data.number }} samt Positionen ({{ data.positions.length }}) und Nebenkosten endgültig löschen? Das lässt sich
              nicht rückgängig machen. War es der neueste Eingang, bekommt der nächste dieselbe Nummer.
            </p>
            <template v-else-if="deletePreview">
              <UAlert
                v-if="deletePreview.blockedBy.length > 0"
                color="warning"
                variant="subtle"
                icon="i-lucide-triangle-alert"
                class="rounded-[12px]"
                :description="`Aus diesem Wareneingang gibt es schon weitere Buchungen (${deletePreview.blockedBy.join(', ')}). Löschen ist dann nicht möglich – korrigieren Sie den Preis per Gutschrift oder stornieren Sie im Bestandsjournal.`"
              />
              <template v-else>
                <p class="text-sm">
                  Nur für falsch erfasste Eingänge. Gelöscht werden endgültig und ohne Storno-Spur:
                </p>
                <ul class="list-disc space-y-1 pl-5 text-sm">
                  <li>{{ deletePreview.positions }} Positionen und {{ deletePreview.additionalCosts }} Nebenkosten</li>
                  <li>die Zugangsbuchungen: <strong>{{ deletePreview.quantity }} Stück</strong> gehen aus dem Bestand</li>
                  <li v-if="deletePreview.shopify.length > 0">
                    in Shopify wieder abgezogen:
                    {{ deletePreview.shopify.map((s) => `${s.sku} ${s.delta}`).join(', ') }}
                    – vorher werden die Bestellungen von dort abgerufen
                  </li>
                  <li v-else-if="deletePreview.unlinked.length === 0">
                    Shopify: nichts zu tun, der Zugang war dort nicht übertragen
                  </li>
                  <li v-if="deletePreview.unlinked.length > 0">
                    nicht mehr mit Shopify verknüpft: {{ deletePreview.unlinked.join(', ') }} – der Bestand dort bleibt
                    unverändert, bitte von Hand korrigieren
                  </li>
                </ul>
                <p class="text-xs text-leinen-500">
                  War es der neueste Eingang, bekommt der nächste dieselbe Nummer.
                </p>
                <UFormField :label="`Zum Bestätigen die Belegnummer ${deletePreview.number} eingeben`">
                  <UInput v-model="deleteConfirm" class="w-full" autocomplete="off" />
                </UFormField>
              </template>
            </template>
            <p v-else-if="!deleteMessage" class="text-sm text-leinen-500">Wird geprüft …</p>
            <div class="flex justify-end gap-2 pt-2">
              <UButton color="neutral" variant="ghost" class="rounded-[8px]" @click="deleteOpen = false">Abbrechen</UButton>
              <UButton
                color="error"
                :loading="deleteBusy"
                :disabled="!deleteAllowed"
                class="rounded-[8px]"
                @click="confirmDelete"
              >
                Endgültig löschen
              </UButton>
            </div>
          </div>
        </template>
      </UModal>
    </div>
  </div>
</template>

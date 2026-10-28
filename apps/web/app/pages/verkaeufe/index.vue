<script setup lang="ts">
import { MoneyError, parseMoney } from '@roslett/core';
import type { Channel, List, Product, SaleListItem, SaleStatus, VatRate } from '~~/shared/types/api';

useHead({ title: 'Verkäufe' });

const { formatMoney, formatPercent, formatDate, toInput } = useMoney();
const { readError } = useApiError();

// --- List -------------------------------------------------------------------
const search = ref('');
const searchDebounced = useDebounced(search, 250);
const channelFilter = ref('all');
const statusFilter = ref<'all' | SaleStatus | 'shortfall'>('all');
const page = ref(0);
const perPage = 100;

const { data, pending, error, refresh } = await useFetch<List<SaleListItem>>('/api/sales', {
  query: {
    search: searchDebounced,
    channelId: computed(() => (channelFilter.value === 'all' ? undefined : channelFilter.value)),
    status: computed(() => (['open', 'shipped', 'cancelled'].includes(statusFilter.value) ? statusFilter.value : undefined)),
    shortfallOnly: computed(() => statusFilter.value === 'shortfall'),
    limit: perPage,
    offset: computed(() => page.value * perPage),
  },
});

watch([searchDebounced, channelFilter, statusFilter], () => {
  page.value = 0;
});
const pageCount = computed(() => (data.value ? Math.max(1, Math.ceil(data.value.total / perPage)) : 1));

const { data: channels } = await useFetch<List<Channel>>('/api/channels');
const activeChannels = computed(() => channels.value?.items.filter((c) => c.active) ?? []);
const channelFilterOptions = computed(() => [
  { label: 'Alle Kanäle', value: 'all' },
  ...(channels.value?.items.map((c) => ({ label: c.name, value: c.id })) ?? []),
]);
const statusOptions = [
  { label: 'Alle Status', value: 'all' },
  { label: 'Offen', value: 'open' },
  { label: 'Versendet', value: 'shipped' },
  { label: 'Storniert', value: 'cancelled' },
  { label: 'Mit Fehlmenge', value: 'shortfall' },
];

const statusLabels: Record<SaleStatus, { label: string; color: 'neutral' | 'success' | 'warning' }> = {
  open: { label: 'offen', color: 'neutral' },
  shipped: { label: 'versendet', color: 'success' },
  cancelled: { label: 'storniert', color: 'warning' },
};

function openRow(id: string, event: MouseEvent) {
  if ((event.target as HTMLElement | null)?.closest('a, button')) return;
  if ((window.getSelection()?.toString() ?? '') !== '') return;
  navigateTo(`/verkaeufe/${id}`);
}

// --- Manual entry -------------------------------------------------------------
const { data: products } = await useFetch<List<Product>>('/api/products', { query: { limit: 500 } });
const variants = computed(
  () =>
    products.value?.items.flatMap((p) =>
      p.variants
        .filter((v) => v.archivedAt === null)
        .map((v) => ({ id: v.id, label: `${v.sku} · ${p.name} ${v.label}`, priceGross: v.priceGross ?? p.basePriceGross })),
    ) ?? [],
);
const variantOptions = computed(() => variants.value.map((v) => ({ label: v.label, value: v.id })));

const { data: vatRates } = await useFetch<List<VatRate>>('/api/vat-rates');
const countryOptions = computed(() => [...new Set(vatRates.value?.items.map((r) => r.country) ?? ['DE'])].sort());

const today = () => new Date().toISOString().slice(0, 10);

type Row = { variantId?: string; quantity: number; unitPriceGross: string };
const dialogOpen = ref(false);
const saving = ref(false);
const message = ref<string | null>(null);
const fieldErrors = ref<Record<string, string>>({});
const form = reactive({
  channelId: undefined as string | undefined,
  externalOrderNumber: '',
  orderedAt: today(),
  deliveryCountry: 'DE',
  discountGross: '',
  shippingRevenueGross: '',
  postageCost: '',
  rows: [] as Row[],
});

const selectedChannel = computed(() => activeChannels.value.find((c) => c.id === form.channelId));

function addRow() {
  form.rows.push({ variantId: undefined, quantity: 1, unitPriceGross: '' });
}

/** Presets the shelf price when a variant is picked; an entered price stays. */
function pickVariant(row: Row, variantId: string | undefined) {
  row.variantId = variantId;
  const price = variants.value.find((v) => v.id === variantId)?.priceGross;
  if (row.unitPriceGross === '' && price != null) row.unitPriceGross = toInput(price);
}

function openDialog() {
  message.value = null;
  fieldErrors.value = {};
  Object.assign(form, {
    channelId: activeChannels.value[0]?.id,
    externalOrderNumber: '',
    orderedAt: today(),
    deliveryCountry: 'DE',
    discountGross: '',
    shippingRevenueGross: '',
    postageCost: '',
    rows: [],
  });
  addRow();
  dialogOpen.value = true;
}

function cents(input: string): number | null {
  if (input.trim() === '') return null;
  try {
    return parseMoney(input);
  } catch (err) {
    if (err instanceof MoneyError) return null;
    throw err;
  }
}

const goodsGross = computed(() =>
  form.rows.reduce((sum, row) => sum + (cents(row.unitPriceGross) ?? 0) * (Number(row.quantity) || 0), 0),
);

/** What the server will use when the field stays empty. */
const shippingDefault = computed(() => {
  const channel = selectedChannel.value;
  if (!channel) return null;
  if (channel.freeShippingFrom !== null && goodsGross.value >= channel.freeShippingFrom) return 0;
  return channel.shippingPriceGross;
});

/** Per-row messages, e.g. "Position 2 · Menge: Menge muss mindestens 1 sein." */
const rowErrors = computed(() => {
  const names: Record<string, string> = { variantId: 'Variante', quantity: 'Menge', unitPriceGross: 'VK brutto' };
  return Object.entries(fieldErrors.value).flatMap(([key, text]) => {
    const match = /^items\.(\d+)\.(\w+)$/.exec(key);
    return match ? [`Position ${Number(match[1]) + 1} · ${names[match[2] ?? ''] ?? match[2]}: ${text}`] : [];
  });
});

async function create() {
  saving.value = true;
  message.value = null;
  fieldErrors.value = {};
  try {
    const created = await $fetch<{ id: string; warnings: string[] }>('/api/sales', {
      method: 'POST',
      body: {
        channelId: form.channelId,
        externalOrderNumber: form.externalOrderNumber,
        orderedAt: form.orderedAt,
        deliveryCountry: form.deliveryCountry,
        discountGross: form.discountGross || 0,
        shippingRevenueGross: form.shippingRevenueGross || undefined,
        postageCost: form.postageCost || undefined,
        items: form.rows
          .filter((r) => r.variantId)
          .map((r) => ({ variantId: r.variantId, quantity: r.quantity, unitPriceGross: r.unitPriceGross })),
      },
    });
    dialogOpen.value = false;
    await refresh();
    await navigateTo(`/verkaeufe/${created.id}`);
  } catch (err) {
    const { message: text, fields } = readError(err);
    message.value = text;
    fieldErrors.value = fields;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div>
    <SeitenKopf titel="Verkäufe" hinweis="Bestellungen aller Kanäle mit Wareneinsatz nach FIFO und Marge je Bestellung.">
      <template #aktionen>
        <UButton icon="i-lucide-plus" size="sm" class="rounded-[8px]" :disabled="!activeChannels.length" @click="openDialog">
          Bestellung erfassen
        </UButton>
      </template>
    </SeitenKopf>

    <div class="px-6 py-4">
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Bestellnummer oder SKU"
          size="sm"
          class="w-64"
          :ui="{ base: 'rounded-[8px]' }"
        />
        <USelectMenu v-model="channelFilter" :items="channelFilterOptions" value-key="value" size="sm" class="w-44" />
        <USelectMenu v-model="statusFilter" :items="statusOptions" value-key="value" size="sm" class="w-44" />
      </div>

      <UAlert
        v-if="!activeChannels.length && channels"
        color="warning"
        variant="subtle"
        icon="i-lucide-store"
        class="mb-4 rounded-[12px]"
        description="Zum Erfassen braucht es mindestens einen aktiven Kanal (Einstellungen → Kanäle)."
      />

      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        class="mb-4 rounded-[12px]"
        title="Die Verkäufe konnten nicht geladen werden."
        :description="error.message"
      />

      <div v-else-if="pending && !data" class="py-12 text-center text-sm text-leinen-500">Wird geladen …</div>

      <div
        v-else-if="!data?.items.length"
        class="rounded-[12px] border border-leinen-200/70 bg-white py-16 text-center"
        style="border-width: 0.5px"
      >
        <p class="text-sm font-medium">
          {{ search || channelFilter !== 'all' || statusFilter !== 'all' ? 'Kein Verkauf gefunden.' : 'Noch keine Verkäufe erfasst.' }}
        </p>
        <p class="mt-1 text-sm text-leinen-500">
          Bestellungen kommen später automatisch aus Shopify; bis dahin lassen sie sich von Hand erfassen.
        </p>
      </div>

      <template v-else>
        <div class="overflow-x-auto rounded-[12px] border border-leinen-200/70 bg-white" style="border-width: 0.5px">
          <table class="ros-tabelle w-full min-w-[56rem] whitespace-nowrap text-sm">
            <thead
              class="border-b border-leinen-200/70 bg-leinen-50/60 text-left text-xs font-medium uppercase tracking-wide text-leinen-500"
            >
              <tr>
                <th class="px-4">Datum</th>
                <th class="px-4">Kanal</th>
                <th class="px-4">Bestellung</th>
                <th class="px-4">Land</th>
                <th class="px-4 text-right">Stück</th>
                <th class="px-4 text-right">Umsatz brutto</th>
                <th class="px-4 text-right">Marge</th>
                <th class="px-4">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-leinen-200/60">
              <tr
                v-for="item in data.items"
                :key="item.id"
                class="group cursor-pointer transition-colors hover:bg-leinen-50/70"
                @click="openRow(item.id, $event)"
              >
                <td class="px-4 text-leinen-500">{{ formatDate(item.orderedAt) }}</td>
                <td class="px-4">{{ item.channelName ?? '–' }}</td>
                <td class="px-4">
                  <NuxtLink :to="`/verkaeufe/${item.id}`" class="font-mono font-medium group-hover:text-ros-600">
                    {{ item.externalOrderNumber }}
                  </NuxtLink>
                </td>
                <td class="px-4 font-mono text-xs">{{ item.deliveryCountry }}</td>
                <td class="zahl px-4">{{ item.pieces }}</td>
                <td class="zahl px-4">{{ formatMoney(item.goodsGross) }}</td>
                <td class="zahl px-4" :class="{ 'text-leinen-400': item.shortfall > 0 }">
                  <template v-if="item.status === 'cancelled'">–</template>
                  <template v-else>
                    {{ formatMoney(item.contributionMarginEur) }}
                    <span class="text-xs text-leinen-500">· {{ formatPercent(item.margin, 0) }}</span>
                    <span v-if="item.shortfall > 0" class="block text-[11px]">vorläufig</span>
                  </template>
                </td>
                <td class="px-4">
                  <div class="flex flex-wrap gap-1">
                    <UBadge size="sm" :color="statusLabels[item.status].color" variant="subtle" class="rounded-[8px]">
                      {{ statusLabels[item.status].label }}
                    </UBadge>
                    <UBadge v-if="item.shortfall > 0" size="sm" color="error" variant="subtle" class="rounded-[8px]">
                      Fehlmenge {{ item.shortfall }}
                    </UBadge>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="pageCount > 1" class="mt-4 flex items-center justify-between text-sm text-leinen-500">
          <span>{{ data.total }} Verkäufe · Seite {{ page + 1 }} von {{ pageCount }}</span>
          <div class="flex gap-2">
            <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-chevron-left" class="rounded-[8px]" :disabled="page === 0" @click="page -= 1">
              Zurück
            </UButton>
            <UButton size="sm" variant="ghost" color="neutral" trailing-icon="i-lucide-chevron-right" class="rounded-[8px]" :disabled="page + 1 >= pageCount" @click="page += 1">
              Weiter
            </UButton>
          </div>
        </div>
      </template>
    </div>

    <UModal v-model:open="dialogOpen" title="Bestellung erfassen" :ui="{ content: 'sm:max-w-3xl' }">
      <template #body>
        <form class="space-y-4" @submit.prevent="create">
          <UAlert v-if="message" color="error" variant="subtle" icon="i-lucide-circle-alert" class="rounded-[12px]" :description="message">
            <template v-if="rowErrors.length" #description>
              <p>{{ message }}</p>
              <ul class="mt-1 list-disc pl-4">
                <li v-for="text in rowErrors" :key="text">{{ text }}</li>
              </ul>
            </template>
          </UAlert>

          <div class="grid gap-4 sm:grid-cols-4">
            <UFormField label="Kanal" required :error="fieldErrors.channelId" class="sm:col-span-2">
              <USelectMenu
                v-model="form.channelId"
                :items="activeChannels.map((c) => ({ label: c.name, value: c.id }))"
                value-key="value"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Bestellnummer" required :error="fieldErrors.externalOrderNumber">
              <UInput v-model="form.externalOrderNumber" placeholder="#1001" class="w-full font-mono" />
            </UFormField>
            <UFormField label="Datum" required :error="fieldErrors.orderedAt">
              <UInput v-model="form.orderedAt" type="date" class="w-full" />
            </UFormField>
          </div>

          <div class="space-y-2">
            <p class="text-sm font-medium">Positionen</p>
            <div v-for="(row, index) in form.rows" :key="index" class="grid grid-cols-[1fr_5rem_8rem_2rem] items-start gap-2">
              <USelectMenu
                :model-value="row.variantId"
                :items="variantOptions"
                value-key="value"
                placeholder="Variante wählen"
                class="w-full"
                :aria-label="`Position ${index + 1}: Variante`"
                @update:model-value="pickVariant(row, $event)"
              />
              <UInput v-model.number="row.quantity" type="number" min="1" class="w-full" :aria-label="`Position ${index + 1}: Menge`" />
              <BetragFeld v-model="row.unitPriceGross" class="w-full" :aria-label="`Position ${index + 1}: VK brutto`" />
              <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-x"
                class="rounded-[8px]"
                :disabled="form.rows.length === 1"
                :aria-label="`Position ${index + 1} entfernen`"
                @click="form.rows.splice(index, 1)"
              />
            </div>
            <UButton size="xs" variant="ghost" icon="i-lucide-plus" class="rounded-[8px]" @click="addRow">Position</UButton>
          </div>

          <div class="grid gap-4 sm:grid-cols-4">
            <UFormField label="Lieferland" :error="fieldErrors.deliveryCountry">
              <USelectMenu v-model="form.deliveryCountry" :items="countryOptions" class="w-full" />
            </UFormField>
            <UFormField label="Rabatt brutto" :error="fieldErrors.discountGross">
              <BetragFeld v-model="form.discountGross" class="w-full" />
            </UFormField>
            <UFormField label="Versanderlös" :error="fieldErrors.shippingRevenueGross" :help="`leer = ${formatMoney(shippingDefault)}`">
              <BetragFeld v-model="form.shippingRevenueGross" class="w-full" :placeholder="toInput(shippingDefault)" />
            </UFormField>
            <UFormField label="Porto" :error="fieldErrors.postageCost" :help="`leer = ${formatMoney(selectedChannel?.defaultPostage)}`">
              <BetragFeld v-model="form.postageCost" class="w-full" :placeholder="toInput(selectedChannel?.defaultPostage)" />
            </UFormField>
          </div>

          <p class="text-sm text-leinen-500">
            Warenwert {{ formatMoney(goodsGross) }} · Gebühr wird pauschal aus dem Kanal berechnet. Fehlt Bestand, wird trotzdem gebucht
            (Fehlmenge).
          </p>

          <div class="flex justify-end gap-2 pt-2">
            <UButton color="neutral" variant="ghost" class="rounded-[8px]" @click="dialogOpen = false">Abbrechen</UButton>
            <UButton type="submit" :loading="saving" class="rounded-[8px]">Buchen</UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>

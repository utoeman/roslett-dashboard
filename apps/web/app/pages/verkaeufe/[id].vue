<script setup lang="ts">
import type { Sale, SaleStatus } from '~~/shared/types/api';

const route = useRoute();
const id = computed(() => String(route.params.id));

const { formatMoney, formatPercent, formatDate } = useMoney();
const { readError } = useApiError();

const { data, pending, error, refresh } = await useFetch<Sale>(() => `/api/sales/${id.value}`);
useHead({ title: () => data.value?.externalOrderNumber ?? 'Verkauf' });

const statusLabels: Record<SaleStatus, { label: string; color: 'neutral' | 'success' | 'warning' }> = {
  open: { label: 'offen', color: 'neutral' },
  shipped: { label: 'versendet', color: 'success' },
  cancelled: { label: 'storniert', color: 'warning' },
};

const feeLabels: Record<string, string> = {
  transaction: 'Transaktion',
  payment: 'Zahlung',
  listing: 'Einstellgebühr',
  advertising: 'Werbung',
  other: 'Sonstiges',
};

const saving = ref(false);
const message = ref<string | null>(null);

async function setStatus(status: 'open' | 'shipped') {
  saving.value = true;
  message.value = null;
  try {
    // Plain string: Nuxt's typed routes recurse too deep on template-literal URLs.
    const url: string = `/api/sales/${id.value}`;
    await $fetch(url, { method: 'PATCH', body: { status } });
    await refresh();
  } catch (err) {
    message.value = readError(err).message;
  } finally {
    saving.value = false;
  }
}

/** Rows of the margin breakdown; costs negative, revenue positive. */
const breakdown = computed(() => {
  const t = data.value?.totals;
  if (!t) return [];
  return [
    { label: 'VK netto', amount: t.revenueNetEur },
    { label: 'Wareneinsatz (FIFO)', amount: -t.costOfGoodsEur },
    { label: 'Stückkosten', amount: -t.costItemsEur },
    { label: 'Gebühren', amount: -t.feesEur },
    { label: 'Porto', amount: -t.postageEur },
    { label: 'Versanderlös netto', amount: t.shippingRevenueNetEur },
    { label: 'Rabatt netto', amount: -t.discountNetEur },
  ].filter((row) => row.amount !== 0 || row.label === 'VK netto');
});
</script>

<template>
  <div>
    <div v-if="error" class="p-6">
      <UAlert color="error" variant="subtle" class="rounded-[12px]" title="Verkauf nicht gefunden" />
      <UButton to="/verkaeufe" variant="ghost" class="mt-4 rounded-[8px]" icon="i-lucide-arrow-left">Zur Liste</UButton>
    </div>

    <div v-else-if="pending && !data" class="p-6 text-sm text-leinen-500">Wird geladen …</div>

    <div v-else-if="data">
      <SeitenKopf
        :titel="`${data.channel?.name ?? 'Unbekannter Kanal'} ${data.externalOrderNumber}`"
        :hinweis="`Bestellt am ${formatDate(data.orderedAt)} · Lieferland ${data.deliveryCountry}`"
      >
        <template #aktionen>
          <UBadge :color="statusLabels[data.status].color" variant="subtle" class="rounded-[8px]">
            {{ statusLabels[data.status].label }}
          </UBadge>
          <UButton to="/verkaeufe" variant="ghost" color="neutral" size="sm" icon="i-lucide-arrow-left" class="rounded-[8px]">
            Alle
          </UButton>
          <UButton
            v-if="data.status === 'open'"
            icon="i-lucide-truck"
            size="sm"
            class="rounded-[8px]"
            :loading="saving"
            @click="setStatus('shipped')"
          >
            Als versendet markieren
          </UButton>
          <UButton
            v-else-if="data.status === 'shipped'"
            variant="outline"
            size="sm"
            class="rounded-[8px]"
            :loading="saving"
            @click="setStatus('open')"
          >
            Wieder auf offen
          </UButton>
        </template>
      </SeitenKopf>

      <div class="grid gap-6 px-6 py-4 lg:grid-cols-3">
        <div class="min-w-0 space-y-4 lg:col-span-2">
          <UAlert v-if="message" color="error" variant="subtle" icon="i-lucide-circle-alert" class="rounded-[12px]" :description="message" />
          <UAlert
            v-if="data.provisional"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            class="rounded-[12px]"
            title="Wareneinsatz vorläufig"
            description="Ein Teil wurde ohne Bestand verkauft (Fehlmenge). Er ist mit dem aktuellen Ø-Einstand geschätzt und wird beim nächsten Wareneingang der richtigen Charge zugeordnet."
          />

          <section class="overflow-x-auto rounded-[12px] border border-leinen-200/70 bg-white" style="border-width: 0.5px">
            <table class="ros-tabelle w-full min-w-[40rem] whitespace-nowrap text-sm">
              <thead
                class="border-b border-leinen-200/70 bg-leinen-50/60 text-left text-xs font-medium uppercase tracking-wide text-leinen-500"
              >
                <tr>
                  <th class="px-4">Position</th>
                  <th class="px-4 text-right">Menge</th>
                  <th class="px-4 text-right">VK brutto</th>
                  <th class="px-4 text-right">VK netto</th>
                  <th class="px-4 text-right">Wareneinsatz</th>
                  <th class="px-4 text-right">Marge</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-leinen-200/60">
                <tr v-for="item in data.items" :key="item.id">
                  <td class="whitespace-normal px-4">
                    <NuxtLink :to="`/produkte/${item.variant.productId}`" class="font-medium hover:text-ros-600">
                      {{ item.variant.productName }} {{ item.variant.label }}
                    </NuxtLink>
                    <span class="block whitespace-nowrap font-mono text-xs text-leinen-500">{{ item.variant.sku }}</span>
                  </td>
                  <td class="zahl px-4">
                    {{ item.quantity }}
                    <UBadge v-if="item.shortfall > 0" size="sm" color="error" variant="subtle" class="ml-1 rounded-[8px]">
                      {{ item.shortfall }} Fehlmenge
                    </UBadge>
                  </td>
                  <td class="zahl px-4">{{ formatMoney(item.unitPriceGross) }}</td>
                  <td class="zahl px-4">
                    {{ formatMoney(item.revenueNetEur) }}
                    <span class="block text-xs text-leinen-500">{{ formatPercent(item.vatRate, 0) }} MwSt</span>
                  </td>
                  <td class="zahl px-4">{{ formatMoney(item.costOfGoodsEur) }}</td>
                  <td class="zahl px-4" :class="item.contributionMarginEur < 0 ? 'text-red-600' : ''">
                    {{ formatMoney(item.contributionMarginEur) }}
                    <span class="block text-xs text-leinen-500">{{ formatPercent(item.margin, 0) }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <p class="text-xs text-leinen-500">
            Rabatt, Versanderlös, Porto und Gebühren sind nach Warenwert auf die Positionen verteilt und in der Marge je Position enthalten.
          </p>
        </div>

        <aside class="space-y-4">
          <section class="rounded-[12px] border border-leinen-200/70 bg-white p-4" style="border-width: 0.5px">
            <h2 class="mb-3 text-sm font-semibold">Marge der Bestellung</h2>
            <dl class="space-y-1.5 text-sm">
              <div v-for="row in breakdown" :key="row.label" class="flex justify-between gap-4">
                <dt class="text-leinen-600">{{ row.label }}</dt>
                <dd class="zahl">{{ row.amount < 0 ? '−' : '' }}{{ formatMoney(Math.abs(row.amount)) }}</dd>
              </div>
              <div class="flex justify-between gap-4 border-t border-leinen-200/70 pt-2 font-semibold">
                <dt>Marge</dt>
                <dd class="zahl" :class="data.totals.contributionMarginEur < 0 ? 'text-red-600' : ''">
                  {{ formatMoney(data.totals.contributionMarginEur) }} · {{ formatPercent(data.totals.margin) }}
                </dd>
              </div>
            </dl>
          </section>

          <section class="rounded-[12px] border border-leinen-200/70 bg-white p-4 text-sm" style="border-width: 0.5px">
            <h2 class="mb-3 font-semibold">Bestellung</h2>
            <dl class="space-y-1.5">
              <div class="flex justify-between gap-4">
                <dt class="text-leinen-600">Warenwert brutto</dt>
                <dd class="zahl">{{ formatMoney(data.totals.goodsGross) }}</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-leinen-600">Rabatt brutto</dt>
                <dd class="zahl">{{ formatMoney(data.discountGross) }}</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-leinen-600">Versanderlös brutto</dt>
                <dd class="zahl">{{ formatMoney(data.shippingRevenueGross) }}</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-leinen-600">Porto</dt>
                <dd class="zahl">{{ formatMoney(data.postageCost) }}</dd>
              </div>
              <div v-for="fee in data.fees" :key="fee.id" class="flex justify-between gap-4">
                <dt class="text-leinen-600">
                  Gebühr {{ feeLabels[fee.kind] ?? fee.kind }}
                  <span class="text-xs">({{ fee.source === 'flat' ? 'pauschal' : 'exakt' }})</span>
                </dt>
                <dd class="zahl">{{ formatMoney(fee.amount) }}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  </div>
</template>

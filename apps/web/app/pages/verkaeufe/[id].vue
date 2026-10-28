<script setup lang="ts">
import type { Sale, SaleStatus } from '~~/shared/types/api';

const route = useRoute();
const id = computed(() => String(route.params.id));

const { formatMoney, formatPercent, formatDate, toInput } = useMoney();
const { readError } = useApiError();

const { data, pending, error, refresh } = await useFetch<Sale>(() => `/api/sales/${id.value}`);
useHead({ title: () => data.value?.externalOrderNumber ?? 'Verkauf' });

// Plain string: Nuxt's typed routes recurse too deep on template-literal URLs.
const api = (suffix = ''): string => `/api/sales/${id.value}${suffix}`;
const today = () => new Date().toISOString().slice(0, 10);

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
const fieldErrors = ref<Record<string, string>>({});

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

function setStatus(status: 'open' | 'shipped') {
  return run(() => $fetch(api(), { method: 'PATCH', body: { status } }));
}

const canCancel = computed(() => data.value?.status === 'open' && data.value.refunds.length === 0);
const canRefund = computed(() => !!data.value && data.value.status !== 'cancelled');

// --- Cancel -------------------------------------------------------------------
const cancelOpen = ref(false);
const cancelNote = ref('');

function openCancel() {
  message.value = null;
  cancelNote.value = '';
  cancelOpen.value = true;
}

function submitCancel() {
  return run(
    () => $fetch(api('/cancel'), { method: 'POST', body: { note: cancelNote.value || null } }),
    () => (cancelOpen.value = false),
  );
}

// --- Refund / return ----------------------------------------------------------
type RefundKind = 'return' | 'refund' | 'goodwill';
const refundKinds = [
  { label: 'Retoure – Ware kommt zurück', value: 'return' },
  { label: 'Erstattung ohne Rücksendung', value: 'refund' },
  { label: 'Kulanz auf die Bestellung', value: 'goodwill' },
];
const refundOpen = ref(false);
const refund = reactive({
  kind: 'return' as RefundKind,
  saleItemId: undefined as string | undefined,
  quantity: 1,
  amountGross: '',
  damaged: false,
  refundedAt: today(),
  note: '',
});
// Once the amount differs from the last suggestion it was typed by hand and stays.
const suggestedAmount = ref('');
const amountTouched = computed(() => refund.amountGross !== suggestedAmount.value);

/** What the customer paid: quantity × price, minus the line's share of the order discount. */
function suggestAmount() {
  if (amountTouched.value || refund.kind === 'goodwill' || !selectedItem.value || !data.value) return;
  const paidShare = data.value.totals.goodsGross > 0 ? 1 - data.value.discountGross / data.value.totals.goodsGross : 1;
  refund.amountGross = toInput(Math.round(selectedItem.value.unitPriceGross * (Number(refund.quantity) || 0) * paidShare));
  suggestedAmount.value = refund.amountGross;
}

const itemOptions = computed(
  () =>
    data.value?.items.map((i) => ({
      label: `${i.variant.sku} · ${i.variant.productName} ${i.variant.label} (${i.quantity - i.refundedQuantity} offen)`,
      value: i.id,
    })) ?? [],
);
const selectedItem = computed(() => data.value?.items.find((i) => i.id === refund.saleItemId));

watch(() => [refund.kind, refund.saleItemId, refund.quantity] as const, suggestAmount);

function openRefund() {
  message.value = null;
  fieldErrors.value = {};
  suggestedAmount.value = '';
  Object.assign(refund, {
    kind: 'return',
    saleItemId: data.value?.items.length === 1 ? data.value.items[0]?.id : undefined,
    quantity: 1,
    amountGross: '',
    damaged: false,
    refundedAt: today(),
    note: '',
  });
  suggestAmount();
  refundOpen.value = true;
}

function submitRefund() {
  const goodwill = refund.kind === 'goodwill';
  return run(
    () =>
      $fetch(api('/refunds'), {
        method: 'POST',
        body: {
          saleItemId: goodwill ? null : (refund.saleItemId ?? null),
          quantity: goodwill ? 0 : refund.quantity,
          amountGross: refund.amountGross || 0,
          restocked: refund.kind === 'return',
          damaged: refund.kind === 'return' && refund.damaged,
          refundedAt: refund.refundedAt,
          note: refund.note || null,
        },
      }),
    () => (refundOpen.value = false),
  );
}

function refundLabel(r: Sale['refunds'][number]): string {
  if (r.saleItemId === null) return 'Kulanz';
  if (!r.restocked) return 'Erstattung ohne Rücksendung';
  return r.damaged ? 'Retoure, beschädigt' : 'Retoure';
}
const itemName = (saleItemId: string | null) => {
  const item = data.value?.items.find((i) => i.id === saleItemId);
  return item ? `${item.variant.productName} ${item.variant.label}` : 'ganze Bestellung';
};

/** Rows of the margin breakdown; costs negative, revenue positive. */
const breakdown = computed(() => {
  const t = data.value?.totals;
  if (!t) return [];
  if (data.value?.status === 'cancelled') return [{ label: 'Gebühren (bleiben stehen)', amount: -t.feesEur }];
  return [
    { label: 'VK netto', amount: t.revenueNetEur },
    { label: 'Wareneinsatz (FIFO)', amount: -t.costOfGoodsEur },
    { label: 'Stückkosten', amount: -t.costItemsEur },
    { label: 'Gebühren', amount: -t.feesEur },
    { label: 'Porto', amount: -t.postageEur },
    { label: 'Versanderlös netto', amount: t.shippingRevenueNetEur },
    { label: 'Rabatt netto', amount: -t.discountNetEur },
    { label: 'Erstattungen netto', amount: -t.refundNetEur },
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
          <UBadge v-if="data.returnState !== 'none'" color="info" variant="subtle" class="rounded-[8px]">
            {{ data.returnState === 'full' ? 'Retoure' : 'Teilretoure' }}
          </UBadge>
          <UButton to="/verkaeufe" variant="ghost" color="neutral" size="sm" icon="i-lucide-arrow-left" class="rounded-[8px]">
            Alle
          </UButton>
          <UButton v-if="canCancel" variant="outline" color="error" size="sm" icon="i-lucide-ban" class="rounded-[8px]" @click="openCancel">
            Stornieren
          </UButton>
          <UButton v-if="canRefund" variant="outline" size="sm" icon="i-lucide-undo-2" class="rounded-[8px]" @click="openRefund">
            Erstattung / Retoure
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
            variant="ghost"
            color="neutral"
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
          <UAlert
            v-if="message && !refundOpen && !cancelOpen"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            class="rounded-[12px]"
            :description="message"
          />
          <UAlert
            v-if="data.status === 'cancelled'"
            color="warning"
            variant="subtle"
            icon="i-lucide-ban"
            class="rounded-[12px]"
            title="Storniert"
            description="Die Ware ist auf die Chargen zurückgebucht. Gebühren bleiben stehen, bis exakte Werte aus Shopify kommen."
          />
          <UAlert
            v-else-if="data.provisional"
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
                    <span v-if="item.refundedQuantity > 0" class="block text-xs text-leinen-500">{{ item.refundedQuantity }} zurück</span>
                    <UBadge v-if="item.shortfall > 0" size="sm" color="error" variant="subtle" class="rounded-[8px]">
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
            Rabatt, Versanderlös, Porto, Gebühren und Kulanz sind nach Warenwert auf die Positionen verteilt und in der Marge je Position
            enthalten.
          </p>

          <section
            v-if="data.refunds.length"
            class="overflow-x-auto rounded-[12px] border border-leinen-200/70 bg-white"
            style="border-width: 0.5px"
          >
            <h2 class="px-4 pt-3 text-sm font-semibold">Erstattungen</h2>
            <table class="ros-tabelle w-full min-w-[36rem] text-sm">
              <thead class="text-left text-xs font-medium uppercase tracking-wide text-leinen-500">
                <tr>
                  <th class="px-4">Datum</th>
                  <th class="px-4">Art</th>
                  <th class="px-4">Position</th>
                  <th class="px-4 text-right">Stück</th>
                  <th class="px-4 text-right">Betrag</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-leinen-200/60">
                <tr v-for="r in data.refunds" :key="r.id">
                  <td class="px-4 text-leinen-500">{{ formatDate(r.refundedAt) }}</td>
                  <td class="px-4">
                    {{ refundLabel(r) }}
                    <span v-if="r.note" class="block text-xs text-leinen-500">{{ r.note }}</span>
                  </td>
                  <td class="px-4">{{ itemName(r.saleItemId) }}</td>
                  <td class="zahl px-4">{{ r.quantity || '–' }}</td>
                  <td class="zahl px-4">{{ formatMoney(r.amountGross) }}</td>
                </tr>
              </tbody>
            </table>
          </section>
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

      <UModal v-model:open="cancelOpen" title="Bestellung stornieren">
        <template #body>
          <form class="space-y-4" @submit.prevent="submitCancel">
            <UAlert v-if="message" color="error" variant="subtle" icon="i-lucide-circle-alert" class="rounded-[12px]" :description="message" />
            <p class="text-sm">
              Alle Positionen werden auf ihre Chargen zurückgebucht, der Status wird „storniert“. Das lässt sich nicht rückgängig machen.
              Die Gebühren bleiben stehen.
            </p>
            <UFormField label="Notiz" :error="fieldErrors.note">
              <UInput v-model="cancelNote" class="w-full" :placeholder="`Storno ${data.externalOrderNumber}`" />
            </UFormField>
            <div class="flex justify-end gap-2 pt-2">
              <UButton color="neutral" variant="ghost" class="rounded-[8px]" @click="cancelOpen = false">Abbrechen</UButton>
              <UButton type="submit" color="error" :loading="saving" class="rounded-[8px]">Stornieren</UButton>
            </div>
          </form>
        </template>
      </UModal>

      <UModal v-model:open="refundOpen" title="Erstattung oder Retoure">
        <template #body>
          <form class="space-y-4" @submit.prevent="submitRefund">
            <UAlert v-if="message" color="error" variant="subtle" icon="i-lucide-circle-alert" class="rounded-[12px]" :description="message" />
            <URadioGroup v-model="refund.kind" :items="refundKinds" value-key="value" />

            <template v-if="refund.kind !== 'goodwill'">
              <UFormField label="Position" required :error="fieldErrors.saleItemId">
                <USelectMenu v-model="refund.saleItemId" :items="itemOptions" value-key="value" placeholder="Position wählen" class="w-full" />
              </UFormField>
              <UFormField label="Menge" required :error="fieldErrors.quantity">
                <UInput v-model.number="refund.quantity" type="number" min="1" class="w-32" />
              </UFormField>
            </template>

            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField
                label="Betrag brutto"
                required
                :error="fieldErrors.amountGross"
                :help="refund.kind === 'goodwill' ? 'wird nach Warenwert auf die Positionen verteilt' : 'vorbelegt mit dem bezahlten Betrag (VK abzüglich Rabattanteil)'"
              >
                <BetragFeld v-model="refund.amountGross" class="w-full" />
              </UFormField>
              <UFormField label="Datum" required :error="fieldErrors.refundedAt">
                <UInput v-model="refund.refundedAt" type="date" class="w-full" />
              </UFormField>
            </div>

            <UCheckbox
              v-if="refund.kind === 'return'"
              v-model="refund.damaged"
              label="Ware beschädigt – gleich als Schwund ausbuchen"
            />

            <UFormField label="Notiz" :error="fieldErrors.note">
              <UInput v-model="refund.note" class="w-full" />
            </UFormField>

            <p class="text-sm text-leinen-500">
              <template v-if="refund.kind === 'return'">Die Ware kommt auf die Chargen der Position zurück; der Erlös sinkt um den Betrag.</template>
              <template v-else>Kein Bestand wird gebucht; nur der Erlös sinkt. Der Wareneinsatz bleibt als Verlust in der Marge.</template>
            </p>

            <div class="flex justify-end gap-2 pt-2">
              <UButton color="neutral" variant="ghost" class="rounded-[8px]" @click="refundOpen = false">Abbrechen</UButton>
              <UButton type="submit" :loading="saving" class="rounded-[8px]">Buchen</UButton>
            </div>
          </form>
        </template>
      </UModal>
    </div>
  </div>
</template>

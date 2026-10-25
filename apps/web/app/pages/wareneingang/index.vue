<script setup lang="ts">
import type { GoodsReceipt, GoodsReceiptListItem, List, ReceiptKind, Supplier } from '~~/shared/types/api';

useHead({ title: 'Wareneingang' });

const { formatMoney, formatDate } = useMoney();
const { readError } = useApiError();

const { data, pending, error } = await useFetch<List<GoodsReceiptListItem>>('/api/goods-receipts');
const { data: suppliers } = await useFetch<List<Supplier>>('/api/suppliers');
const supplierOptions = computed(() => suppliers.value?.items.map((s) => ({ label: s.name, value: s.id })) ?? []);

const today = () => new Date().toISOString().slice(0, 10);

const dialogOpen = ref(false);
const saving = ref(false);
const message = ref<string | null>(null);
const fieldErrors = ref<Record<string, string>>({});
const form = reactive({
  kind: 'purchase' as ReceiptKind,
  supplierId: undefined as string | undefined,
  invoiceNumber: '',
  invoiceDate: today(),
  currency: '',
  /** Only needed when the ECB has no rate for the currency. */
  exchangeRate: '',
});

// Preset the supplier's currency; it can still be overwritten.
watch(
  () => form.supplierId,
  (supplierId) => {
    form.currency = suppliers.value?.items.find((s) => s.id === supplierId)?.defaultCurrency ?? form.currency;
  },
);

const isProduction = computed(() => form.kind === 'production');

function openDialog(kind: ReceiptKind = 'purchase') {
  message.value = null;
  fieldErrors.value = {};
  Object.assign(form, { kind, supplierId: undefined, invoiceNumber: '', invoiceDate: today(), currency: '', exchangeRate: '' });
  dialogOpen.value = true;
}

async function create() {
  saving.value = true;
  message.value = null;
  fieldErrors.value = {};
  try {
    const created = await $fetch<GoodsReceipt>('/api/goods-receipts', {
      method: 'POST',
      body: {
        kind: form.kind,
        supplierId: form.supplierId,
        invoiceNumber: form.invoiceNumber || null,
        invoiceDate: form.invoiceDate,
        currency: form.currency || undefined,
        exchangeRate: form.exchangeRate ? form.exchangeRate.replace(',', '.') : undefined,
      },
    });
    dialogOpen.value = false;
    await navigateTo(`/wareneingang/${created.id}`);
  } catch (err) {
    const { message: text, fields } = readError(err);
    message.value = text;
    fieldErrors.value = fields;
  } finally {
    saving.value = false;
  }
}

function status(item: GoodsReceiptListItem): { label: string; color: 'neutral' | 'warning' | 'info' | 'success' } {
  if (item.state === 'draft') return { label: 'Entwurf', color: 'neutral' };
  if (item.deliveryState === 'complete') return { label: 'vollständig', color: 'success' };
  if (item.deliveryState === 'partial') return { label: 'teilgeliefert', color: 'info' };
  return { label: 'offen', color: 'warning' };
}

function openRow(id: string, event: MouseEvent) {
  if ((event.target as HTMLElement | null)?.closest('a, button')) return;
  if ((window.getSelection()?.toString() ?? '') !== '') return;
  navigateTo(`/wareneingang/${id}`);
}
</script>

<template>
  <div>
    <SeitenKopf
      titel="Wareneingang"
      hinweis="Lieferantenrechnungen und eigene Produktion mit Positionen, Nebenkosten und Zugängen."
    >
      <template #aktionen>
        <UButton icon="i-lucide-scissors" size="sm" variant="outline" class="rounded-[8px]" @click="openDialog('production')">
          Produktion anlegen
        </UButton>
        <UButton icon="i-lucide-plus" size="sm" class="rounded-[8px]" @click="openDialog()">
          Wareneingang anlegen
        </UButton>
      </template>
    </SeitenKopf>

    <div class="px-6 py-4">
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        class="mb-4 rounded-[12px]"
        title="Die Wareneingänge konnten nicht geladen werden."
        :description="error.message"
      />

      <div v-else-if="pending && !data" class="py-12 text-center text-sm text-leinen-500">Wird geladen …</div>

      <div
        v-else-if="!data?.items.length"
        class="rounded-[12px] border border-leinen-200/70 bg-white py-16 text-center"
        style="border-width: 0.5px"
      >
        <p class="text-sm font-medium">Noch kein Wareneingang erfasst.</p>
        <p class="mt-1 text-sm text-leinen-500">Erfassen Sie die erste Lieferantenrechnung mit ihren Positionen.</p>
        <UButton icon="i-lucide-plus" size="sm" class="mt-4 rounded-[8px]" @click="openDialog()">
          Wareneingang anlegen
        </UButton>
      </div>

      <div
        v-else
        class="overflow-x-auto rounded-[12px] border border-leinen-200/70 bg-white"
        style="border-width: 0.5px"
      >
        <table class="ros-tabelle w-full min-w-[48rem] text-sm">
          <thead
            class="border-b border-leinen-200/70 bg-leinen-50/60 text-left text-xs font-medium uppercase tracking-wide text-leinen-500"
          >
            <tr>
              <th class="px-4">Nummer</th>
              <th class="px-4">Lieferant / Näherei</th>
              <th class="px-4">Rechnung</th>
              <th class="px-4 text-right">Geliefert</th>
              <th class="px-4 text-right">Warenwert</th>
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
              <td class="px-4">
                <NuxtLink :to="`/wareneingang/${item.id}`" class="font-mono font-medium group-hover:text-ros-600">
                  {{ item.number }}
                </NuxtLink>
              </td>
              <td class="px-4">
                {{ item.supplierName }}
                <UBadge v-if="item.kind === 'production'" size="sm" color="neutral" variant="subtle" class="ml-1 rounded-[8px]">
                  Produktion
                </UBadge>
              </td>
              <td class="px-4 text-leinen-500">
                {{ item.invoiceNumber ?? '–' }} · {{ formatDate(item.invoiceDate) }}
                <span v-if="item.currency !== 'EUR'" class="ml-1 font-mono text-xs">{{ item.currency }}</span>
              </td>
              <td class="zahl px-4">{{ item.delivered }} / {{ item.ordered }}</td>
              <td class="zahl px-4">{{ formatMoney(item.goodsValueEur) }}</td>
              <td class="px-4">
                <UBadge size="sm" :color="status(item).color" variant="subtle" class="rounded-[8px]">
                  {{ status(item).label }}
                </UBadge>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal v-model:open="dialogOpen" :title="isProduction ? 'Produktion anlegen' : 'Wareneingang anlegen'">
      <template #body>
        <form class="space-y-4" @submit.prevent="create">
          <UAlert
            v-if="message"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            class="rounded-[12px]"
            :description="message"
          />
          <UFormField
            :label="isProduction ? 'Näherei' : 'Lieferant'"
            required
            :error="fieldErrors.supplierId"
            :help="isProduction ? 'Nählohn je Stück kommt in die Positionen, Stoff und Zubehör in die Nebenkosten.' : undefined"
          >
            <USelectMenu
              v-model="form.supplierId"
              :items="supplierOptions"
              value-key="value"
              :placeholder="isProduction ? 'Näherei wählen (angelegt als Lieferant)' : 'Lieferant wählen'"
              class="w-full"
            />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Rechnungsnummer" :error="fieldErrors.invoiceNumber">
              <UInput v-model="form.invoiceNumber" class="w-full" />
            </UFormField>
            <UFormField label="Rechnungsdatum" required :error="fieldErrors.invoiceDate">
              <UInput v-model="form.invoiceDate" type="date" class="w-full" />
            </UFormField>
          </div>
          <UFormField
            label="Währung"
            :error="fieldErrors.currency"
            help="Vorbelegt vom Lieferanten. Der EZB-Kurs zum Rechnungsdatum wird automatisch geholt."
          >
            <WaehrungAuswahl v-model="form.currency" />
          </UFormField>
          <UFormField
            v-if="fieldErrors.exchangeRate || form.exchangeRate"
            label="Kurs von Hand"
            :error="fieldErrors.exchangeRate"
            :help="`Wie viele ${form.currency || 'Einheiten'} entsprechen 1 EUR, z. B. 55,1033.`"
          >
            <UInput v-model="form.exchangeRate" class="w-full font-mono" />
          </UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <UButton color="neutral" variant="ghost" class="rounded-[8px]" @click="dialogOpen = false">
              Abbrechen
            </UButton>
            <UButton type="submit" :loading="saving" class="rounded-[8px]">Anlegen</UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>

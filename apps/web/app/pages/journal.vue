<script setup lang="ts">
import type { BatchOption, List, Product, StockEntry, StockEntryKind } from '~~/shared/types/api';

useHead({ title: 'Bestandsjournal' });

const route = useRoute();
const { formatDate } = useMoney();
const { readError } = useApiError();

const PAGE_SIZE = 50;
const today = () => new Date().toISOString().slice(0, 10);

const kindLabels: Record<StockEntryKind, string> = {
  goods_receipt: 'Wareneingang',
  sale: 'Verkauf',
  return: 'Retoure',
  shrinkage: 'Schwund',
  own_use: 'Eigenverbrauch',
  stocktake: 'Inventur',
  supplier_return: 'Rückgabe an Lieferant',
  reversal: 'Storno',
};
const kindColors: Record<StockEntryKind, 'success' | 'info' | 'warning' | 'neutral'> = {
  goods_receipt: 'success',
  sale: 'info',
  return: 'info',
  shrinkage: 'warning',
  own_use: 'warning',
  stocktake: 'info',
  supplier_return: 'warning',
  reversal: 'neutral',
};

// --- Filters ----------------------------------------------------------------
const filters = reactive({
  variantId: typeof route.query.variantId === 'string' ? route.query.variantId : '',
  kind: 'all' as StockEntryKind | 'all',
  from: '',
  to: '',
  shortfallsOnly: false,
});
const page = ref(0);
watch(filters, () => (page.value = 0), { deep: true });

const query = computed(() => ({
  limit: PAGE_SIZE,
  offset: page.value * PAGE_SIZE,
  variantId: filters.variantId || undefined,
  kind: filters.kind === 'all' ? undefined : filters.kind,
  from: filters.from || undefined,
  to: filters.to || undefined,
  shortfallsOnly: filters.shortfallsOnly || undefined,
}));
const { data, pending, error, refresh } = await useFetch<List<StockEntry>>('/api/stock-entries', { query });
const pageCount = computed(() => Math.ceil((data.value?.total ?? 0) / PAGE_SIZE));

const { data: products, refresh: refreshProducts } = await useFetch<List<Product>>('/api/products', {
  query: { limit: 500 },
});
const variants = computed(
  () =>
    products.value?.items.flatMap((p) =>
      p.variants.map((v) => ({
        label: `${v.sku} · ${p.name} ${v.label}`,
        value: v.id,
        stock: v.inventory?.stock ?? 0,
      })),
    ) ?? [],
);
const variantFilterOptions = computed(() => [{ label: 'Alle Varianten', value: '' }, ...variants.value]);
const kindFilterOptions = [
  { label: 'Alle Arten', value: 'all' },
  ...Object.entries(kindLabels).map(([value, label]) => ({ value, label })),
];

const filtered = computed(
  () => !!(filters.variantId || filters.kind !== 'all' || filters.from || filters.to || filters.shortfallsOnly),
);
function resetFilters() {
  Object.assign(filters, { variantId: '', kind: 'all', from: '', to: '', shortfallsOnly: false });
}

// --- Shared submit handling -------------------------------------------------
const saving = ref(false);
const message = ref<string | null>(null);
const fieldErrors = ref<Record<string, string>>({});

// `unknown` on purpose: comparing $fetch's typed response against Promise<…> overflows the checker.
async function run(action: () => unknown, onDone: () => void) {
  saving.value = true;
  message.value = null;
  fieldErrors.value = {};
  try {
    await action();
    onDone();
    await Promise.all([refresh(), refreshProducts()]);
  } catch (err) {
    const { message: text, fields } = readError(err);
    message.value = text;
    fieldErrors.value = fields;
  } finally {
    saving.value = false;
  }
}

// --- Manual entry -----------------------------------------------------------
type ManualKind = 'shrinkage' | 'own_use' | 'stocktake' | 'supplier_return';
const manualKindOptions: { label: string; value: ManualKind }[] = [
  { label: 'Schwund', value: 'shrinkage' },
  { label: 'Eigenverbrauch', value: 'own_use' },
  { label: 'Inventur', value: 'stocktake' },
  { label: 'Rückgabe an Lieferant', value: 'supplier_return' },
];

const entryOpen = ref(false);
const entry = reactive({
  kind: 'shrinkage' as ManualKind,
  variantId: undefined as string | undefined,
  quantity: 1,
  counted: 0,
  batchId: undefined as string | undefined,
  postedAt: today(),
  note: '',
});
const currentStock = computed(() => variants.value.find((v) => v.value === entry.variantId)?.stock ?? 0);

const batches = ref<BatchOption[]>([]);
const batchOptions = computed(() =>
  batches.value
    .filter((b) => b.remaining > 0)
    .map((b) => ({
      label: `${b.receiptNumber ?? '–'} · ${formatDate(b.invoiceDate)} · noch ${b.remaining}`,
      value: b.id,
    })),
);
watch(
  () => [entry.kind, entry.variantId] as const,
  async ([kind, variantId]) => {
    entry.batchId = undefined;
    batches.value =
      kind === 'supplier_return' && variantId
        ? (await $fetch<{ items: BatchOption[] }>('/api/batches', { query: { variantId } })).items
        : [];
  },
);

function openEntry() {
  message.value = null;
  fieldErrors.value = {};
  Object.assign(entry, {
    kind: 'shrinkage',
    variantId: filters.variantId || undefined,
    quantity: 1,
    counted: 0,
    batchId: undefined,
    postedAt: today(),
    note: '',
  });
  entryOpen.value = true;
}

function submitEntry() {
  const base = { kind: entry.kind, variantId: entry.variantId, postedAt: entry.postedAt, note: entry.note || undefined };
  const body =
    entry.kind === 'stocktake'
      ? { ...base, counted: entry.counted }
      : entry.kind === 'supplier_return'
        ? { ...base, batchId: entry.batchId, quantity: entry.quantity }
        : { ...base, quantity: entry.quantity };
  return run(
    () => $fetch('/api/stock-entries', { method: 'POST', body }),
    () => (entryOpen.value = false),
  );
}

// --- Reversal ---------------------------------------------------------------
const reverseTarget = ref<StockEntry | null>(null);
const reverseNote = ref('');
// Plain string: Nuxt's typed routes recurse too deep on template-literal URLs.
const reverseUrl = (id: string): string => `/api/stock-entries/${id}/reverse`;

function openReverse(item: StockEntry) {
  message.value = null;
  fieldErrors.value = {};
  reverseNote.value = '';
  reverseTarget.value = item;
}

function submitReverse() {
  const target = reverseTarget.value;
  if (!target) return;
  return run(
    () => $fetch(reverseUrl(target.id), { method: 'POST', body: { note: reverseNote.value || undefined } }),
    () => (reverseTarget.value = null),
  );
}
const reverseOpen = computed({
  get: () => reverseTarget.value !== null,
  set: (open: boolean) => {
    if (!open) reverseTarget.value = null;
  },
});

const signed = (quantity: number) => (quantity > 0 ? `+${quantity}` : String(quantity));
</script>

<template>
  <div>
    <SeitenKopf titel="Bestandsjournal" hinweis="Jede Bestandsänderung als Buchung; korrigiert wird per Storno.">
      <template #aktionen>
        <UButton icon="i-lucide-plus" size="sm" class="rounded-[8px]" @click="openEntry">Buchung erfassen</UButton>
      </template>
    </SeitenKopf>

    <div class="px-6 py-4">
      <div class="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <UFormField label="Variante">
          <USelectMenu
            v-model="filters.variantId"
            :items="variantFilterOptions"
            value-key="value"
            class="w-full"
            aria-label="Nach Variante filtern"
          />
        </UFormField>
        <UFormField label="Art">
          <USelectMenu
            v-model="filters.kind"
            :items="kindFilterOptions"
            value-key="value"
            class="w-full"
            aria-label="Nach Art filtern"
          />
        </UFormField>
        <UFormField label="Von">
          <UInput v-model="filters.from" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Bis">
          <UInput v-model="filters.to" type="date" class="w-full" />
        </UFormField>
        <div class="flex items-end gap-3 pb-1.5">
          <UCheckbox v-model="filters.shortfallsOnly" label="Nur offene Fehlmengen" />
        </div>
      </div>

      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        class="mb-4 rounded-[12px]"
        title="Das Journal konnte nicht geladen werden."
        :description="error.message"
      />

      <div v-else-if="pending && !data" class="py-12 text-center text-sm text-leinen-500">Wird geladen …</div>

      <div
        v-else-if="!data?.items.length"
        class="rounded-[12px] border border-leinen-200/70 bg-white py-16 text-center"
        style="border-width: 0.5px"
      >
        <template v-if="filtered">
          <p class="text-sm font-medium">Keine Buchungen für diese Filter.</p>
          <UButton size="sm" variant="ghost" color="neutral" class="mt-3 rounded-[8px]" @click="resetFilters">
            Filter zurücksetzen
          </UButton>
        </template>
        <template v-else>
          <p class="text-sm font-medium">Noch keine Buchungen.</p>
          <p class="mt-1 text-sm text-leinen-500">Zugänge entstehen beim Buchen eines Wareneingangs.</p>
        </template>
      </div>

      <div
        v-else
        class="overflow-x-auto rounded-[12px] border border-leinen-200/70 bg-white"
        style="border-width: 0.5px"
      >
        <table class="ros-tabelle w-full min-w-[56rem] text-sm">
          <thead
            class="border-b border-leinen-200/70 bg-leinen-50/60 text-left text-xs font-medium uppercase tracking-wide text-leinen-500"
          >
            <tr>
              <th class="px-4">Datum</th>
              <th class="px-4">Art</th>
              <th class="px-4">Variante</th>
              <th class="px-4 text-right">Menge</th>
              <th class="px-4">Charge</th>
              <th class="px-4">Notiz</th>
              <th class="px-4 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-leinen-200/60">
            <tr v-for="item in data.items" :key="item.id" :class="item.reversedById ? 'text-leinen-400' : ''">
              <td class="px-4 whitespace-nowrap">{{ formatDate(item.postedAt) }}</td>
              <td class="px-4">
                <UBadge size="sm" :color="kindColors[item.kind]" variant="subtle" class="whitespace-nowrap rounded-[8px]">
                  {{ kindLabels[item.kind] }}
                </UBadge>
              </td>
              <td class="px-4">
                {{ item.variant.productName }} {{ item.variant.label }}
                <div class="font-mono text-xs text-leinen-500">{{ item.variant.sku }}</div>
              </td>
              <td class="zahl px-4 font-medium" :class="item.quantity > 0 ? 'text-ros-700' : 'text-red-700'">
                {{ signed(item.quantity) }}
              </td>
              <td class="px-4 text-xs">
                <div v-for="b in item.batches" :key="`${b.batchId}-${b.quantity}`" class="font-mono">
                  {{ b.receiptNumber ?? '–' }} <span class="text-leinen-500">({{ signed(b.quantity) }})</span>
                </div>
                <UBadge v-if="item.openShortfall < 0" size="sm" color="error" variant="subtle" class="rounded-[8px]">
                  Fehlmenge {{ -item.openShortfall }} offen
                </UBadge>
              </td>
              <td class="max-w-[16rem] px-4 text-leinen-500">{{ item.note ?? '' }}</td>
              <td class="px-4 text-right">
                <UBadge v-if="item.reversedById" size="sm" color="neutral" variant="subtle" class="rounded-[8px]">
                  storniert
                </UBadge>
                <span v-else-if="item.kind === 'reversal'" class="text-xs text-leinen-400">Gegenbuchung</span>
                <UButton
                  v-else-if="item.saleId"
                  :to="`/verkaeufe/${item.saleId}`"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-shopping-bag"
                  class="rounded-[8px]"
                >
                  Zum Verkauf
                </UButton>
                <UButton
                  v-else
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-undo-2"
                  class="rounded-[8px]"
                  :aria-label="`Buchung vom ${formatDate(item.postedAt)} stornieren`"
                  @click="openReverse(item)"
                >
                  Stornieren
                </UButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="data && pageCount > 1" class="mt-3 flex items-center justify-between text-sm">
        <p class="text-leinen-500">Seite {{ page + 1 }} von {{ pageCount }} · {{ data.total }} Buchungen</p>
        <div class="flex gap-2">
          <UButton size="sm" variant="ghost" color="neutral" :disabled="page === 0" class="rounded-[8px]" @click="page -= 1">
            Zurück
          </UButton>
          <UButton
            size="sm"
            variant="ghost"
            color="neutral"
            :disabled="page + 1 >= pageCount"
            class="rounded-[8px]"
            @click="page += 1"
          >
            Weiter
          </UButton>
        </div>
      </div>
    </div>

    <UModal v-model:open="entryOpen" title="Buchung erfassen">
      <template #body>
        <form class="space-y-4" @submit.prevent="submitEntry">
          <UAlert
            v-if="message"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            class="rounded-[12px]"
            :description="message"
          />
          <UFormField label="Art" required>
            <USelectMenu v-model="entry.kind" :items="manualKindOptions" value-key="value" class="w-full" />
          </UFormField>
          <UFormField
            label="Variante"
            required
            :error="fieldErrors.variantId"
            :help="entry.variantId ? `Aktueller Bestand: ${currentStock}` : undefined"
          >
            <USelectMenu
              v-model="entry.variantId"
              :items="variants"
              value-key="value"
              placeholder="SKU oder Produkt suchen"
              class="w-full"
            />
          </UFormField>
          <UFormField
            v-if="entry.kind === 'supplier_return'"
            label="Charge"
            required
            :error="fieldErrors.batchId"
            :help="entry.variantId && !batchOptions.length ? 'Keine Charge mit Restbestand.' : undefined"
          >
            <USelectMenu
              v-model="entry.batchId"
              :items="batchOptions"
              value-key="value"
              placeholder="Wareneingang wählen"
              class="w-full"
            />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              v-if="entry.kind === 'stocktake'"
              label="Gezählter Bestand"
              required
              :error="fieldErrors.counted"
              :help="entry.variantId ? `Differenz: ${signed(entry.counted - currentStock)}` : undefined"
            >
              <UInput v-model.number="entry.counted" type="number" min="0" class="w-full" />
            </UFormField>
            <UFormField v-else label="Menge" required :error="fieldErrors.quantity" help="Stück, die abgehen.">
              <UInput v-model.number="entry.quantity" type="number" min="1" class="w-full" />
            </UFormField>
            <UFormField label="Datum" :error="fieldErrors.postedAt">
              <UInput v-model="entry.postedAt" type="date" class="w-full" />
            </UFormField>
          </div>
          <UFormField
            label="Notiz"
            :required="entry.kind !== 'supplier_return'"
            :error="fieldErrors.note"
            help="Grund der Buchung, z. B. „Transportschaden“."
          >
            <UInput v-model="entry.note" class="w-full" />
          </UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <UButton color="neutral" variant="ghost" class="rounded-[8px]" @click="entryOpen = false">Abbrechen</UButton>
            <UButton type="submit" :loading="saving" class="rounded-[8px]">Buchen</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="reverseOpen" title="Buchung stornieren">
      <template #body>
        <form v-if="reverseTarget" class="space-y-4" @submit.prevent="submitReverse">
          <UAlert
            v-if="message"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            class="rounded-[12px]"
            :description="message"
          />
          <p class="text-sm">
            {{ kindLabels[reverseTarget.kind] }} vom {{ formatDate(reverseTarget.postedAt) }}:
            <span class="font-medium">{{ signed(reverseTarget.quantity) }}</span>
            {{ reverseTarget.variant.productName }} {{ reverseTarget.variant.label }}
          </p>
          <p class="text-sm text-leinen-500">
            Der Storno bucht die Gegenmenge auf dieselben Chargen. Die ursprüngliche Buchung bleibt sichtbar.
          </p>
          <UFormField label="Notiz" :error="fieldErrors.note">
            <UInput v-model="reverseNote" class="w-full" placeholder="z. B. falsche Menge erfasst" />
          </UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <UButton color="neutral" variant="ghost" class="rounded-[8px]" @click="reverseOpen = false">
              Abbrechen
            </UButton>
            <UButton type="submit" color="error" :loading="saving" class="rounded-[8px]">Stornieren</UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>

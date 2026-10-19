<script setup lang="ts">
import type { Category, List, Product } from '~~/shared/types/api';

useHead({ title: 'Produkte' });

const { formatMoney } = useMoney();
const { readError } = useApiError();

const search = ref('');
const includeArchived = ref(false);
const page = ref(0);
const perPage = 100;

const searchDebounced = useDebounced(search, 250);

const { data, pending, error } = await useFetch<List<Product>>(
  '/api/products',
  {
    query: {
      search: searchDebounced,
      includeArchived,
      limit: perPage,
      offset: computed(() => page.value * perPage),
    },
  },
);

// Back to page one when search or filter changes.
watch([searchDebounced, includeArchived], () => {
  page.value = 0;
});

const pageCount = computed(() =>
  data.value ? Math.max(1, Math.ceil(data.value.total / perPage)) : 1,
);

const dialogOpen = ref(false);
const saving = ref(false);
const fieldErrors = ref<Record<string, string>>({});
const message = ref<string | null>(null);

const { data: categories } = await useFetch<List<Category>>('/api/categories');
const categoryOptions = computed(
  () => categories.value?.items.map((c) => ({ label: `${c.code} · ${c.name}`, value: c.id })) ?? [],
);
const vatOptions = [
  { label: 'Normal', value: 'standard' },
  { label: 'Ermäßigt', value: 'reduced' },
];

const form = reactive({
  name: '',
  categoryId: undefined as string | undefined,
  basePriceGross: '',
  vatCategory: 'standard' as 'standard' | 'reduced',
});

async function create() {
  saving.value = true;
  fieldErrors.value = {};
  message.value = null;
  try {
    const created = await $fetch<Product>('/api/products', {
      method: 'POST',
      body: {
        name: form.name,
        categoryId: form.categoryId,
        basePriceGross: form.basePriceGross || null,
        vatCategory: form.vatCategory,
      },
    });
    dialogOpen.value = false;
    await navigateTo(`/produkte/${created.id}`);
  } catch (err) {
    const { message: text, fields } = readError(err);
    message.value = text;
    fieldErrors.value = fields;
  } finally {
    saving.value = false;
  }
}

/** Header hint; says so when not all results are shown. */
const listHint = computed(() => {
  if (!data.value) return undefined;
  const { total, items } = data.value;
  if (total === 0) return 'Keine Produkte';
  if (items.length === total) return total === 1 ? '1 Produkt' : `${total} Produkte`;
  const from = page.value * perPage + 1;
  const to = from + items.length - 1;
  return `Produkte ${from} bis ${to} von ${total}`;
});

/**
 * Row click opens the product. Skipped for clicks on the link itself and while
 * text is selected, so SKUs can still be copied.
 */
function openRow(id: string, event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.closest('a, button, input, label')) return;
  if ((window.getSelection()?.toString() ?? '') !== '') return;
  navigateTo(`/produkte/${id}`);
}

/** Gross price range across all variants. */
function priceRange(product: Product): string {
  const prices = product.variants
    .map((variant) => variant.priceGross ?? product.basePriceGross)
    .filter((price): price is number => price !== null);
  if (prices.length === 0) return '–';
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatMoney(min) : `${formatMoney(min)} – ${formatMoney(max)}`;
}

/** Units on hand and FIFO value over the variants; open shortfalls count as zero. */
function stockOf(product: Product) {
  return product.variants.reduce(
    (total, v) => ({
      stock: total.stock + Math.max(0, v.inventory?.stock ?? 0),
      value: total.value + (v.inventory?.stockValueEur ?? 0),
      low: total.low || (v.inventory?.belowMinimum ?? false),
    }),
    { stock: 0, value: 0, low: false },
  );
}
</script>

<template>
  <div>
    <SeitenKopf titel="Produkte" :hinweis="listHint">
      <template #aktionen>
        <UButton
          icon="i-lucide-plus"
          size="sm"
          class="rounded-[8px]"
          @click="dialogOpen = true"
        >
          Produkt anlegen
        </UButton>
      </template>
    </SeitenKopf>

    <div class="px-6 py-4">
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Name oder SKU"
          size="sm"
          class="w-64"
          :ui="{ base: 'rounded-[8px]' }"
        />
        <UCheckbox v-model="includeArchived" label="Archivierte anzeigen" size="sm" />
      </div>

      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        class="mb-4 rounded-[12px]"
        title="Die Produkte konnten nicht geladen werden."
        :description="error.message"
      />

      <div
        v-else-if="pending && !data"
        class="py-16 text-center text-sm text-leinen-500"
      >
        Produkte werden geladen …
      </div>

      <div
        v-else-if="!data?.items.length"
        class="rounded-[12px] border border-leinen-200/70 bg-white dark:bg-leinen-900 py-16 text-center dark:border-leinen-800"
        style="border-width: 0.5px"
      >
        <p class="text-sm font-medium">
          {{ search ? 'Kein Produkt gefunden.' : 'Noch keine Produkte angelegt.' }}
        </p>
        <p class="mt-1 text-sm text-leinen-500">
          {{
            search
              ? 'Andere Suche versuchen oder archivierte Produkte einblenden.'
              : 'Legen Sie das erste Produkt an, um zu beginnen.'
          }}
        </p>
        <UButton
          v-if="!search"
          icon="i-lucide-plus"
          size="sm"
          class="mt-4 rounded-[8px]"
          @click="dialogOpen = true"
        >
          Produkt anlegen
        </UButton>
      </div>

      <div
        v-else
        class="overflow-x-auto rounded-[12px] border border-leinen-200/70 bg-white dark:bg-leinen-900 dark:border-leinen-800"
        style="border-width: 0.5px"
      >
        <table class="trd-tabelle w-full min-w-[48rem] text-sm">
          <thead
            class="border-b border-leinen-200/70 bg-leinen-50/60 text-left text-xs font-medium uppercase tracking-wide text-leinen-500 dark:border-leinen-800 dark:bg-leinen-900/40"
          >
            <tr>
              <th class="px-4">Produkt</th>
              <th class="px-4">Kategorie</th>
              <th class="px-4">Varianten</th>
              <th class="px-4 text-right">Preis brutto</th>
              <th class="px-4 text-right">Bestand</th>
              <th class="px-4 text-right">Lagerwert</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-leinen-200/60 dark:divide-leinen-800/70">
            <!--
              Whole row is clickable via a handler: `position: relative` is
              unreliable on table rows, so no stretched pseudo-element.
            -->
            <tr
              v-for="product in data.items"
              :key="product.id"
              class="group cursor-pointer transition-colors hover:bg-leinen-50/70 dark:hover:bg-leinen-900/40"
              @click="openRow(product.id, $event)"
            >
              <td class="px-4">
                <NuxtLink
                  :to="`/produkte/${product.id}`"
                  class="font-medium transition-colors group-hover:text-trd-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-trd-500 dark:group-hover:text-trd-400"
                >
                  {{ product.name }}
                </NuxtLink>
                <UBadge
                  v-if="product.archivedAt"
                  size="sm"
                  color="neutral"
                  variant="subtle"
                  class="ml-2 rounded-[8px]"
                >
                  archiviert
                </UBadge>
              </td>
              <td class="px-4 text-leinen-500">{{ product.category.name }}</td>
              <td class="px-4 text-leinen-500">
                <span class="font-mono text-xs">
                  {{ product.variants.map((v) => v.sku).join(', ') }}
                </span>
              </td>
              <td class="zahl px-4">{{ priceRange(product) }}</td>
              <td class="zahl px-4">
                <UBadge
                  v-if="stockOf(product).low"
                  size="sm"
                  color="warning"
                  variant="subtle"
                  class="mr-2 rounded-[8px] font-sans"
                >
                  unter Mindestbestand
                </UBadge>
                {{ stockOf(product).stock }}
              </td>
              <td class="zahl px-4">{{ formatMoney(stockOf(product).value) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        v-if="data && pageCount > 1"
        class="mt-3 flex items-center justify-between text-sm"
      >
        <p class="text-leinen-500">Seite {{ page + 1 }} von {{ pageCount }}</p>
        <div class="flex gap-2">
          <UButton
            size="sm"
            variant="ghost"
            color="neutral"
            icon="i-lucide-chevron-left"
            class="rounded-[8px]"
            :disabled="page === 0"
            @click="page -= 1"
          >
            Zurück
          </UButton>
          <UButton
            size="sm"
            variant="ghost"
            color="neutral"
            trailing-icon="i-lucide-chevron-right"
            class="rounded-[8px]"
            :disabled="page + 1 >= pageCount"
            @click="page += 1"
          >
            Weiter
          </UButton>
        </div>
      </div>
    </div>

    <UModal v-model:open="dialogOpen" title="Produkt anlegen">
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
            label="Name"
            required
            :error="fieldErrors.name"
            help="So heißt das Produkt in Listen und Auswertungen."
          >
            <UInput v-model="form.name" autofocus class="w-full" />
          </UFormField>

          <UFormField
            label="Kategorie"
            required
            :error="fieldErrors.categoryId"
            help="Bestimmt das Kürzel in der SKU und lässt sich später nicht ändern."
          >
            <USelectMenu
              v-model="form.categoryId"
              :items="categoryOptions"
              value-key="value"
              placeholder="Kategorie wählen"
              class="w-full"
            />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              label="Preis brutto"
              :error="fieldErrors.basePriceGross"
              help="Gilt für alle Varianten. Zum Beispiel 39,90"
            >
              <BetragFeld v-model="form.basePriceGross" class="w-full" />
            </UFormField>
            <UFormField label="MwSt" :error="fieldErrors.vatCategory">
              <USelectMenu v-model="form.vatCategory" :items="vatOptions" value-key="value" class="w-full" />
            </UFormField>
          </div>

          <p
            class="rounded-[8px] bg-leinen-50 px-3 py-2 text-xs text-leinen-600 dark:bg-leinen-900 dark:text-leinen-400"
          >
            Produktnummer und SKU werden automatisch vergeben. Farben und Größen
            legen Sie anschließend als Varianten in der Detailansicht an.
          </p>

          <div class="flex justify-end gap-2 pt-2">
            <UButton
              color="neutral"
              variant="ghost"
              class="rounded-[8px]"
              @click="dialogOpen = false"
            >
              Abbrechen
            </UButton>
            <UButton type="submit" :loading="saving" class="rounded-[8px]">
              Anlegen
            </UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>

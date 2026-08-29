<script setup lang="ts">
import type { List, Product } from '~~/shared/types/api';

useHead({ title: 'Artikel' });

const { formatMoney } = useMoney();
const { readError } = useApiError();

const search = ref('');
const includeArchived = ref(false);
const page = ref(0);
const perPage = 100;

// Die Suche wartet einen Moment, damit nicht jeder Tastendruck eine
// Anfrage ausloest.
const searchDebounced = useDebounced(search, 250);

const { data, pending, error, refresh } = await useFetch<List<Product>>(
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

// Bei neuer Suche oder geaendertem Filter zurueck auf die erste Seite –
// sonst landet man auf einer Seite, die es im neuen Ergebnis nicht gibt.
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

const form = reactive({
  name: '',
  sku: '',
  category: '',
});

async function create() {
  saving.value = true;
  fieldErrors.value = {};
  message.value = null;
  try {
    await $fetch('/api/products', {
      method: 'POST',
      body: {
        name: form.name,
        sku: form.sku,
        category: form.category || null,
      },
    });
    dialogOpen.value = false;
    form.name = '';
    form.sku = '';
    form.category = '';
    await refresh();
  } catch (err) {
    const { message: text, fields } = readError(err);
    message.value = text;
    fieldErrors.value = fields;
  } finally {
    saving.value = false;
  }
}

/**
 * Hinweis im Seitenkopf. Weist ausdruecklich aus, wenn die Liste laenger ist
 * als das, was angezeigt wird.
 */
const listHint = computed(() => {
  if (!data.value) return undefined;
  const { total, items } = data.value;
  if (total === 0) return 'Keine Artikel';
  if (items.length === total) return `${total} Artikel`;
  const from = page.value * perPage + 1;
  const to = from + items.length - 1;
  return `Artikel ${from} bis ${to} von ${total}`;
});

/**
 * Klick auf eine Tabellenzeile führt zum Artikel.
 *
 * Klicks auf den Namen übernimmt der Link selbst – sonst würde zweimal
 * navigiert. Markiert der Nutzer gerade Text, wird nicht navigiert: sonst
 * ließe sich eine Artikelnummer nicht herauskopieren.
 */
function openRow(id: string, event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.closest('a, button, input, label')) return;
  if ((window.getSelection()?.toString() ?? '') !== '') return;
  navigateTo(`/artikel/${id}`);
}

/** Zeigt die Preisspanne eines Artikels über alle Varianten. */
function priceRange(product: Product): string {
  const prices = product.variants
    .map((variant) => variant.basePriceNet)
    .filter((price): price is number => price !== null);
  if (prices.length === 0) return '–';
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatMoney(min) : `${formatMoney(min)} – ${formatMoney(max)}`;
}
</script>

<template>
  <div>
    <SeitenKopf titel="Artikel" :hinweis="listHint">
      <template #aktionen>
        <UButton
          icon="i-lucide-plus"
          size="sm"
          class="rounded-[8px]"
          @click="dialogOpen = true"
        >
          Artikel anlegen
        </UButton>
      </template>
    </SeitenKopf>

    <div class="px-6 py-4">
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Name oder Artikelnummer"
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
        title="Die Artikel konnten nicht geladen werden."
        :description="error.message"
      />

      <div
        v-else-if="pending && !data"
        class="py-16 text-center text-sm text-zinc-500"
      >
        Artikel werden geladen …
      </div>

      <div
        v-else-if="!data?.items.length"
        class="rounded-[12px] border border-zinc-200/70 py-16 text-center dark:border-zinc-800"
        style="border-width: 0.5px"
      >
        <p class="text-sm font-medium">
          {{ search ? 'Kein Artikel gefunden.' : 'Noch keine Artikel angelegt.' }}
        </p>
        <p class="mt-1 text-sm text-zinc-500">
          {{
            search
              ? 'Andere Suche versuchen oder archivierte Artikel einblenden.'
              : 'Legen Sie den ersten Artikel an, um zu beginnen.'
          }}
        </p>
        <UButton
          v-if="!search"
          icon="i-lucide-plus"
          size="sm"
          class="mt-4 rounded-[8px]"
          @click="dialogOpen = true"
        >
          Artikel anlegen
        </UButton>
      </div>

      <div
        v-else
        class="overflow-x-auto rounded-[12px] border border-zinc-200/70 dark:border-zinc-800"
        style="border-width: 0.5px"
      >
        <table class="trd-tabelle w-full min-w-[40rem] text-sm">
          <thead
            class="border-b border-zinc-200/70 bg-zinc-50/60 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40"
          >
            <tr>
              <th class="px-4">Artikel</th>
              <th class="px-4">Kategorie</th>
              <th class="px-4">Varianten</th>
              <th class="px-4 text-right">Basispreis netto</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-200/60 dark:divide-zinc-800/70">
            <!--
              Die ganze Zeile führt zum Artikel, weil der Zeilen-Hover das
              ohnehin verspricht. Umgesetzt über einen Klick-Handler statt
              über ein absolut positioniertes Pseudo-Element: `position:
              relative` ist auf einer Tabellenzeile nicht verlässlich
              definiert. Die Zeile ist zugleich `group`, damit sich der Name
              färbt, sobald irgendwo in der Zeile gehovert wird.
            -->
            <tr
              v-for="product in data.items"
              :key="product.id"
              class="group cursor-pointer transition-colors hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40"
              @click="openRow(product.id, $event)"
            >
              <td class="px-4">
                <NuxtLink
                  :to="`/artikel/${product.id}`"
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
              <td class="px-4 text-zinc-500">{{ product.category ?? '–' }}</td>
              <td class="px-4 text-zinc-500">
                <span class="font-mono text-xs">
                  {{ product.variants.map((v) => v.sku).join(', ') }}
                </span>
              </td>
              <td class="zahl px-4">{{ priceRange(product) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        v-if="data && pageCount > 1"
        class="mt-3 flex items-center justify-between text-sm"
      >
        <p class="text-zinc-500">Seite {{ page + 1 }} von {{ pageCount }}</p>
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

    <UModal v-model:open="dialogOpen" title="Artikel anlegen">
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
            help="So heißt der Artikel in Listen und Auswertungen."
          >
            <UInput v-model="form.name" autofocus class="w-full" />
          </UFormField>

          <UFormField
            label="Artikelnummer"
            required
            :error="fieldErrors.sku"
            help="Eindeutig. Buchstaben, Ziffern, Punkt, Bindestrich, Unterstrich."
          >
            <UInput v-model="form.sku" class="w-full font-mono" />
          </UFormField>

          <UFormField label="Kategorie" :error="fieldErrors.category">
            <UInput v-model="form.category" class="w-full" />
          </UFormField>

          <p
            class="rounded-[8px] bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
          >
            Der Artikel erhält automatisch eine Standardvariante. Weitere
            Varianten legen Sie anschließend in der Detailansicht an.
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

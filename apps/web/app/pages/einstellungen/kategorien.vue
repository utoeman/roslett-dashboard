<script setup lang="ts">
import { suggestCode } from '@roslett/core';
import type { Category, CategoryGroup, List, ShopifyTaxonomyCategory } from '~~/shared/types/api';

useHead({ title: 'Kategorien' });

const { readError } = useApiError();

const includeArchived = ref(false);
const { data, pending, refresh } = await useFetch<List<Category>>('/api/categories', {
  query: { includeArchived },
});

const groupOptions = [
  { label: 'Textil', value: 'textile' },
  { label: 'Deko', value: 'decor' },
];
const groupLabel = (group: CategoryGroup) => (group === 'textile' ? 'Textil' : 'Deko');

const dialogOpen = ref(false);
const saving = ref(false);
const message = ref<string | null>(null);
const fieldErrors = ref<Record<string, string>>({});

const editing = ref<Category | null>(null);
const form = reactive({
  code: '',
  name: '',
  group: 'textile' as CategoryGroup,
  shopifyCategoryId: null as string | null,
  shopifyCategoryName: null as string | null,
});

// Shopify's standard product taxonomy (English), searched live; sent as the product category.
const taxonomySearch = ref('');
const taxonomyResults = ref<ShopifyTaxonomyCategory[]>([]);
const taxonomyMessage = ref<string | null>(null);
let taxonomyTimer: ReturnType<typeof setTimeout> | undefined;
watch(taxonomySearch, (term) => {
  clearTimeout(taxonomyTimer);
  taxonomyMessage.value = null;
  if (term.trim().length < 2) {
    taxonomyResults.value = [];
    return;
  }
  taxonomyTimer = setTimeout(async () => {
    try {
      taxonomyResults.value = await $fetch<ShopifyTaxonomyCategory[]>('/api/shopify/taxonomy', { query: { search: term } });
      if (taxonomyResults.value.length === 0) taxonomyMessage.value = 'Nichts gefunden – anderen Begriff versuchen, z. B. „Steppdecke“ statt „Tagesdecke“.';
    } catch (err) {
      taxonomyMessage.value = readError(err).message;
    }
  }, 300);
});
function chooseTaxonomy(category: ShopifyTaxonomyCategory | null) {
  form.shopifyCategoryId = category?.id ?? null;
  form.shopifyCategoryName = category?.name ?? null;
  taxonomySearch.value = '';
  taxonomyResults.value = [];
}
/** Last part of the path, enough for the table. */
const shortTaxonomy = (name: string | null) => name?.split(' > ').pop() ?? '–';

// Codes of all entries, archived too: a code stays unique even when archived.
const takenCodes = ref<string[]>([]);
const codeTouched = ref(false);

watch(
  () => form.name,
  (name) => {
    // Only while creating and until the code was typed by hand.
    if (editing.value || codeTouched.value) return;
    form.code = suggestCode(name, takenCodes.value) ?? '';
  },
);

async function loadTakenCodes() {
  try {
    const all = await $fetch<List<Category>>('/api/categories', { query: { includeArchived: true } });
    takenCodes.value = all.items.map((item) => item.code);
  } catch {
    takenCodes.value = data.value?.items.map((item) => item.code) ?? [];
  }
}

function openDialog(category?: Category) {
  message.value = null;
  fieldErrors.value = {};
  editing.value = category ?? null;
  form.code = category?.code ?? '';
  form.name = category?.name ?? '';
  form.group = category?.group ?? 'textile';
  form.shopifyCategoryId = category?.shopifyCategoryId ?? null;
  form.shopifyCategoryName = category?.shopifyCategoryName ?? null;
  taxonomySearch.value = '';
  taxonomyResults.value = [];
  codeTouched.value = false;
  dialogOpen.value = true;
  if (!category) void loadTakenCodes();
}

async function save() {
  saving.value = true;
  message.value = null;
  fieldErrors.value = {};
  // A code in use is part of SKUs and is not sent at all.
  const shopify = { shopifyCategoryId: form.shopifyCategoryId, shopifyCategoryName: form.shopifyCategoryName };
  const body = editing.value?.inUse
    ? { name: form.name, group: form.group, ...shopify }
    : { code: form.code, name: form.name, group: form.group, ...shopify };
  try {
    if (editing.value) {
      await $fetch(`/api/categories/${editing.value.id}`, { method: 'PATCH', body });
    } else {
      await $fetch('/api/categories', { method: 'POST', body });
    }
    dialogOpen.value = false;
    await refresh();
  } catch (err) {
    const { message: text, fields } = readError(err);
    message.value = text;
    fieldErrors.value = fields;
  } finally {
    saving.value = false;
  }
}

async function setArchived(category: Category, archived: boolean) {
  message.value = null;
  try {
    await $fetch(`/api/categories/${category.id}`, {
      method: 'PATCH',
      body: { archivedAt: archived ? new Date().toISOString() : null },
    });
    await refresh();
  } catch (err) {
    message.value = readError(err).message;
  }
}

// Deleting is only possible for archived, never used entries; the server checks.
const deleting = ref<Category | null>(null);
const deleteOpen = computed({
  get: () => deleting.value !== null,
  set: (open: boolean) => {
    if (!open) deleting.value = null;
  },
});
const deleteBusy = ref(false);
const deleteMessage = ref<string | null>(null);

function askDelete(category: Category) {
  deleteMessage.value = null;
  deleting.value = category;
}

async function confirmDelete() {
  if (deleting.value === null) return;
  deleteBusy.value = true;
  deleteMessage.value = null;
  try {
    await $fetch(`/api/categories/${deleting.value.id}`, { method: 'DELETE' });
    deleting.value = null;
    await refresh();
  } catch (err) {
    deleteMessage.value = readError(err).message;
  } finally {
    deleteBusy.value = false;
  }
}
</script>

<template>
  <div>
    <SeitenKopf titel="Kategorien" hinweis="Kürzel für die SKU, z. B. KIS. Ein verwendetes Kürzel ist fest.">
      <template #aktionen>
        <UButton icon="i-lucide-plus" size="sm" class="rounded-[8px]" @click="openDialog()">
          Kategorie anlegen
        </UButton>
      </template>
    </SeitenKopf>

    <div class="px-6 py-4">
      <div class="mb-4">
        <UCheckbox v-model="includeArchived" label="Archivierte anzeigen" size="sm" />
      </div>

      <UAlert
        v-if="message && !dialogOpen"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        class="mb-4 rounded-[12px]"
        :description="message"
      />

      <div v-if="pending && !data" class="py-12 text-center text-sm text-leinen-500">Wird geladen …</div>

      <div
        v-else
        class="overflow-x-auto rounded-[12px] border border-leinen-200/70 bg-white"
        style="border-width: 0.5px"
      >
        <table class="ros-tabelle w-full min-w-[40rem] text-sm">
          <thead
            class="border-b border-leinen-200/70 bg-leinen-50/60 text-left text-xs font-medium uppercase tracking-wide text-leinen-500"
          >
            <tr>
              <th class="px-4">Kürzel</th>
              <th class="px-4">Name</th>
              <th class="px-4">Gruppe</th>
              <th class="px-4">Shopify-Kategorie</th>
              <th class="px-4">Status</th>
              <th class="px-4 text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-leinen-200/60">
            <tr v-for="category in data?.items" :key="category.id" :class="{ 'text-leinen-400': category.archivedAt }">
              <td class="px-4 font-mono">{{ category.code }}</td>
              <td class="px-4 font-medium">{{ category.name }}</td>
              <td class="px-4 text-leinen-500">{{ groupLabel(category.group) }}</td>
              <td class="px-4 text-leinen-500" :title="category.shopifyCategoryName ?? ''">
                {{ shortTaxonomy(category.shopifyCategoryName) }}
              </td>
              <td class="px-4">
                <UBadge v-if="category.archivedAt" size="sm" color="neutral" variant="subtle" class="rounded-[8px]">
                  archiviert
                </UBadge>
                <UBadge v-else-if="category.inUse" size="sm" color="primary" variant="subtle" class="rounded-[8px]">
                  in Verwendung
                </UBadge>
              </td>
              <td class="px-4">
                <div class="flex justify-end gap-1">
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-pencil"
                    :aria-label="`${category.code} bearbeiten`"
                    class="rounded-[8px]"
                    @click="openDialog(category)"
                  >
                    Bearbeiten
                  </UButton>
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    :icon="category.archivedAt ? 'i-lucide-archive-restore' : 'i-lucide-archive'"
                    :aria-label="`${category.code} ${category.archivedAt ? 'zurückholen' : 'archivieren'}`"
                    class="rounded-[8px]"
                    @click="setArchived(category, !category.archivedAt)"
                  >
                    {{ category.archivedAt ? 'Zurückholen' : 'Archivieren' }}
                  </UButton>
                  <UButton
                    v-if="category.archivedAt"
                    size="xs"
                    variant="ghost"
                    color="error"
                    icon="i-lucide-trash-2"
                    :aria-label="`${category.code} löschen`"
                    class="rounded-[8px]"
                    @click="askDelete(category)"
                  >
                    Löschen
                  </UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal v-model:open="dialogOpen" :title="editing ? 'Kategorie bearbeiten' : 'Kategorie anlegen'">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <UAlert
            v-if="message"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            class="rounded-[12px]"
            :description="message"
          />
          <UFormField label="Name" required :error="fieldErrors.name">
            <UInput v-model="form.name" autofocus class="w-full" />
          </UFormField>
          <UFormField
            label="Kürzel"
            required
            :error="fieldErrors.code"
            :help="editing?.inUse ? 'Wird in SKUs verwendet und ist deshalb fest.' : 'Wird aus dem Namen vorgeschlagen, änderbar. Drei Buchstaben, z. B. KIS.'"
          >
            <UInput
              v-model="form.code"
              :disabled="editing?.inUse"
              maxlength="3"
              class="w-full font-mono uppercase"
              @update:model-value="codeTouched = true"
            />
          </UFormField>
          <UFormField label="Gruppe" :error="fieldErrors.group">
            <USelectMenu v-model="form.group" :items="groupOptions" value-key="value" class="w-full" />
          </UFormField>
          <UFormField
            label="Shopify-Kategorie"
            help="Standard-Produktkategorie von Shopify (für Google Shopping und Steuern), z. B. „Tischsets“, „Kissenbezüge“, „Steppdecke“."
          >
            <div v-if="form.shopifyCategoryName" class="mb-2 flex items-start justify-between gap-2 text-sm">
              <span>{{ form.shopifyCategoryName }}</span>
              <UButton size="xs" variant="ghost" color="neutral" class="rounded-[8px]" @click="chooseTaxonomy(null)">
                Entfernen
              </UButton>
            </div>
            <UInput v-model="taxonomySearch" icon="i-lucide-search" placeholder="Shopify-Kategorie suchen" class="w-full" />
            <p v-if="taxonomyMessage" class="mt-1 text-xs text-leinen-500">{{ taxonomyMessage }}</p>
            <ul v-if="taxonomyResults.length" class="mt-2 max-h-48 overflow-y-auto rounded-[8px] border border-leinen-200 text-sm">
              <li v-for="option in taxonomyResults" :key="option.id">
                <button
                  type="button"
                  class="w-full px-3 py-1.5 text-left hover:bg-leinen-100"
                  @click="chooseTaxonomy(option)"
                >
                  {{ option.name }}
                </button>
              </li>
            </ul>
          </UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <UButton color="neutral" variant="ghost" class="rounded-[8px]" @click="dialogOpen = false">
              Abbrechen
            </UButton>
            <UButton type="submit" :loading="saving" class="rounded-[8px]">
              {{ editing ? 'Speichern' : 'Anlegen' }}
            </UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="deleteOpen" :title="`Kategorie löschen`">
      <template #body>
        <div v-if="deleting" class="space-y-4">
          <UAlert v-if="deleteMessage" color="error" variant="subtle" class="rounded-[12px]" :description="deleteMessage" />
          <p class="text-sm">
            <span class="font-mono">{{ deleting.code }}</span> {{ deleting.name }} endgültig löschen? Das lässt sich nicht
            rückgängig machen. Gelöscht wird nur, wenn die Kategorie nie verwendet wurde.
          </p>
          <div class="flex justify-end gap-2 pt-2">
            <UButton color="neutral" variant="ghost" class="rounded-[8px]" @click="deleting = null">Abbrechen</UButton>
            <UButton color="error" :loading="deleteBusy" class="rounded-[8px]" @click="confirmDelete">Endgültig löschen</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

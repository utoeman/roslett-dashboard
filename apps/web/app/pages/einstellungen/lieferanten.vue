<script setup lang="ts">
import type { List, Supplier } from '~~/shared/types/api';

useHead({ title: 'Lieferanten' });

const { readError } = useApiError();

const includeArchived = ref(false);
const { data, pending, refresh } = await useFetch<List<Supplier>>(
  '/api/suppliers',
  { query: { includeArchived } },
);

const dialogOpen = ref(false);
const saving = ref(false);
const message = ref<string | null>(null);
const fieldErrors = ref<Record<string, string>>({});

/** One dialog for create and edit; `editingId` switches to update. */
const editingId = ref<string | null>(null);
const form = reactive({ name: '', country: '', note: '' });

function openDialog(supplier?: Supplier) {
  message.value = null;
  fieldErrors.value = {};
  editingId.value = supplier?.id ?? null;
  form.name = supplier?.name ?? '';
  form.country = supplier?.country ?? '';
  form.note = supplier?.note ?? '';
  dialogOpen.value = true;
}

async function save() {
  saving.value = true;
  message.value = null;
  fieldErrors.value = {};
  const body = {
    name: form.name,
    country: form.country || null,
    note: form.note || null,
  };
  try {
    if (editingId.value) {
      await $fetch(`/api/suppliers/${editingId.value}`, { method: 'PATCH', body });
    } else {
      await $fetch('/api/suppliers', { method: 'POST', body });
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

async function toggleArchived(supplier: Supplier) {
  try {
    await $fetch(`/api/suppliers/${supplier.id}`, {
      method: 'PATCH',
      body: { archivedAt: supplier.archivedAt ? null : new Date().toISOString() },
    });
    await refresh();
  } catch (err) {
    message.value = readError(err).message;
  }
}
</script>

<template>
  <div>
    <SeitenKopf
      titel="Lieferanten"
      hinweis="Herkunft der Chargen. Archivierte Lieferanten bleiben in bestehenden Chargen erhalten."
    >
      <template #aktionen>
        <UButton icon="i-lucide-plus" size="sm" class="rounded-[8px]" @click="openDialog()">
          Lieferant anlegen
        </UButton>
      </template>
    </SeitenKopf>

    <div class="px-6 py-4">
      <UAlert
        v-if="message && !dialogOpen"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        class="mb-4 rounded-[12px]"
        :description="message"
      />

      <UCheckbox v-model="includeArchived" label="Archivierte anzeigen" size="sm" class="mb-4" />

      <div v-if="pending && !data" class="py-12 text-center text-sm text-leinen-500">
        Wird geladen …
      </div>

      <div
        v-else-if="!data?.items.length"
        class="rounded-[12px] border border-leinen-200/70 bg-white dark:bg-leinen-900 py-16 text-center dark:border-leinen-800"
        style="border-width: 0.5px"
      >
        <p class="text-sm font-medium">Noch keine Lieferanten angelegt.</p>
        <p class="mt-1 text-sm text-leinen-500">
          Lieferanten werden beim Wareneingang einer Charge zugeordnet.
        </p>
      </div>

      <div
        v-else
        class="overflow-x-auto rounded-[12px] border border-leinen-200/70 bg-white dark:bg-leinen-900 dark:border-leinen-800"
        style="border-width: 0.5px"
      >
        <table class="trd-tabelle w-full min-w-[40rem] text-sm">
          <thead
            class="border-b border-leinen-200/70 bg-leinen-50/60 text-left text-xs font-medium uppercase tracking-wide text-leinen-500 dark:border-leinen-800 dark:bg-leinen-900/40"
          >
            <tr>
              <th class="px-4">Name</th>
              <th class="px-4">Land</th>
              <th class="px-4">Notiz</th>
              <th class="px-4 text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-leinen-200/60 dark:divide-leinen-800/70">
            <tr
              v-for="supplier in data.items"
              :key="supplier.id"
              :class="{ 'text-leinen-400': supplier.archivedAt }"
            >
              <td class="px-4 font-medium">
                {{ supplier.name }}
                <UBadge
                  v-if="supplier.archivedAt"
                  size="sm"
                  color="neutral"
                  variant="subtle"
                  class="ml-2 rounded-[8px]"
                >
                  archiviert
                </UBadge>
              </td>
              <td class="px-4 text-leinen-500">{{ supplier.country ?? '–' }}</td>
              <td class="max-w-md truncate px-4 text-leinen-500">{{ supplier.note ?? '–' }}</td>
              <td class="px-4">
                <div class="flex justify-end gap-1">
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-pencil"
                    :aria-label="`${supplier.name} bearbeiten`"
                    class="rounded-[8px]"
                    @click="openDialog(supplier)"
                  >
                    Bearbeiten
                  </UButton>
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    :icon="supplier.archivedAt ? 'i-lucide-archive-restore' : 'i-lucide-archive'"
                    :aria-label="
                      supplier.archivedAt
                        ? `${supplier.name} zurückholen`
                        : `${supplier.name} archivieren`
                    "
                    class="rounded-[8px]"
                    @click="toggleArchived(supplier)"
                  >
                    {{ supplier.archivedAt ? 'Zurückholen' : 'Archivieren' }}
                  </UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal
      v-model:open="dialogOpen"
      :title="editingId ? 'Lieferant bearbeiten' : 'Lieferant anlegen'"
    >
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
            label="Land"
            :error="fieldErrors.country"
            help="Zweistelliger Ländercode, etwa DE oder IT."
          >
            <UInput v-model="form.country" maxlength="2" class="w-full uppercase" />
          </UFormField>
          <UFormField label="Notiz" :error="fieldErrors.note">
            <UTextarea v-model="form.note" :rows="2" class="w-full" />
          </UFormField>
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
              {{ editingId ? 'Speichern' : 'Anlegen' }}
            </UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { Color, List } from '~~/shared/types/api';

useHead({ title: 'Farben' });

const { readError } = useApiError();

const includeArchived = ref(false);
const { data, pending, refresh } = await useFetch<List<Color>>('/api/colors', {
  query: { includeArchived },
});

const dialogOpen = ref(false);
const saving = ref(false);
const message = ref<string | null>(null);
const fieldErrors = ref<Record<string, string>>({});

const editing = ref<Color | null>(null);
const form = reactive({ code: '', name: '' });

function openDialog(color?: Color) {
  message.value = null;
  fieldErrors.value = {};
  editing.value = color ?? null;
  form.code = color?.code ?? '';
  form.name = color?.name ?? '';
  dialogOpen.value = true;
}

async function save() {
  saving.value = true;
  message.value = null;
  fieldErrors.value = {};
  // A code in use is part of SKUs and is not sent at all.
  const body = editing.value?.inUse ? { name: form.name } : { code: form.code, name: form.name };
  try {
    if (editing.value) {
      await $fetch(`/api/colors/${editing.value.id}`, { method: 'PATCH', body });
    } else {
      await $fetch('/api/colors', { method: 'POST', body });
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

async function setArchived(color: Color, archived: boolean) {
  message.value = null;
  try {
    await $fetch(`/api/colors/${color.id}`, {
      method: 'PATCH',
      body: { archivedAt: archived ? new Date().toISOString() : null },
    });
    await refresh();
  } catch (err) {
    message.value = readError(err).message;
  }
}
</script>

<template>
  <div>
    <SeitenKopf titel="Farben" hinweis="Kürzel für die SKU, z. B. SAN. Ein verwendetes Kürzel ist fest.">
      <template #aktionen>
        <UButton icon="i-lucide-plus" size="sm" class="rounded-[8px]" @click="openDialog()">
          Farbe anlegen
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
        <table class="trd-tabelle w-full min-w-[36rem] text-sm">
          <thead
            class="border-b border-leinen-200/70 bg-leinen-50/60 text-left text-xs font-medium uppercase tracking-wide text-leinen-500"
          >
            <tr>
              <th class="px-4">Kürzel</th>
              <th class="px-4">Name</th>
              <th class="px-4">Status</th>
              <th class="px-4 text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-leinen-200/60">
            <tr v-for="color in data?.items" :key="color.id" :class="{ 'text-leinen-400': color.archivedAt }">
              <td class="px-4 font-mono">{{ color.code }}</td>
              <td class="px-4 font-medium">{{ color.name }}</td>
              <td class="px-4">
                <UBadge v-if="color.archivedAt" size="sm" color="neutral" variant="subtle" class="rounded-[8px]">
                  archiviert
                </UBadge>
                <UBadge v-else-if="color.inUse" size="sm" color="primary" variant="subtle" class="rounded-[8px]">
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
                    :aria-label="`${color.code} bearbeiten`"
                    class="rounded-[8px]"
                    @click="openDialog(color)"
                  >
                    Bearbeiten
                  </UButton>
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    :icon="color.archivedAt ? 'i-lucide-archive-restore' : 'i-lucide-archive'"
                    :aria-label="`${color.code} ${color.archivedAt ? 'zurückholen' : 'archivieren'}`"
                    class="rounded-[8px]"
                    @click="setArchived(color, !color.archivedAt)"
                  >
                    {{ color.archivedAt ? 'Zurückholen' : 'Archivieren' }}
                  </UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal v-model:open="dialogOpen" :title="editing ? 'Farbe bearbeiten' : 'Farbe anlegen'">
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
          <UFormField
            label="Kürzel"
            required
            :error="fieldErrors.code"
            :help="editing?.inUse ? 'Wird in SKUs verwendet und ist deshalb fest.' : 'Drei Buchstaben, z. B. SAN.'"
          >
            <UInput v-model="form.code" :disabled="editing?.inUse" maxlength="3" class="w-full font-mono uppercase" />
          </UFormField>
          <UFormField label="Name" required :error="fieldErrors.name">
            <UInput v-model="form.name" class="w-full" />
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
  </div>
</template>

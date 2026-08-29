<script setup lang="ts">
import type { Channel, List } from '~~/shared/types/api';

useHead({ title: 'Kanäle' });

const { formatMoney, formatPercent, toInput, rateToInput } = useMoney();
const { readError } = useApiError();

const { data, pending, refresh } = await useFetch<List<Channel>>('/api/channels');

const dialogOpen = ref(false);
const saving = ref(false);
const message = ref<string | null>(null);
const fieldErrors = ref<Record<string, string>>({});

const editingId = ref<string | null>(null);
const form = reactive({
  name: '',
  feePercent: '',
  feeFixed: '',
  pricingRule: 'same_margin' as 'same_margin' | 'fixed',
});

const ruleOptions = [
  { label: 'Preis aus Zielmarge zurückrechnen', value: 'same_margin' },
  { label: 'Preis fest vorgeben', value: 'fixed' },
];

function openDialog(channel?: Channel) {
  message.value = null;
  fieldErrors.value = {};
  editingId.value = channel?.id ?? null;
  form.name = channel?.name ?? '';
  form.feePercent = channel ? rateToInput(channel.feePercent) : '';
  form.feeFixed = channel && channel.feeFixed ? toInput(channel.feeFixed) : '';
  form.pricingRule = channel?.pricingRule ?? 'same_margin';
  dialogOpen.value = true;
}

async function save() {
  saving.value = true;
  message.value = null;
  fieldErrors.value = {};
  const body = {
    name: form.name,
    feePercent: form.feePercent || 0,
    feeFixed: form.feeFixed || 0,
    pricingRule: form.pricingRule,
  };
  try {
    if (editingId.value) {
      await $fetch(`/api/channels/${editingId.value}`, { method: 'PATCH', body });
    } else {
      await $fetch('/api/channels', { method: 'POST', body });
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

async function toggleActive(channel: Channel) {
  try {
    await $fetch(`/api/channels/${channel.id}`, {
      method: 'PATCH',
      body: { active: !channel.active },
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
      titel="Kanäle"
      hinweis="Verkaufswege mit ihren Gebühren. Grundlage für die Preisrückrechnung."
    >
      <template #aktionen>
        <UButton icon="i-lucide-plus" size="sm" class="rounded-[8px]" @click="openDialog()">
          Kanal anlegen
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

      <div v-if="pending && !data" class="py-12 text-center text-sm text-zinc-500">
        Wird geladen …
      </div>

      <div
        v-else-if="!data?.items.length"
        class="rounded-[12px] border border-zinc-200/70 py-16 text-center dark:border-zinc-800"
        style="border-width: 0.5px"
      >
        <p class="text-sm font-medium">Noch keine Kanäle angelegt.</p>
        <p class="mt-1 text-sm text-zinc-500">
          Ein Kanal beschreibt, wo verkauft wird und welche Gebühren dabei anfallen.
        </p>
      </div>

      <div
        v-else
        class="overflow-x-auto rounded-[12px] border border-zinc-200/70 dark:border-zinc-800"
        style="border-width: 0.5px"
      >
        <table class="trd-tabelle w-full min-w-[44rem] text-sm">
          <thead
            class="border-b border-zinc-200/70 bg-zinc-50/60 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40"
          >
            <tr>
              <th class="px-4">Kanal</th>
              <th class="px-4 text-right">Gebühr prozentual</th>
              <th class="px-4 text-right">Gebühr fix</th>
              <th class="px-4">Preisregel</th>
              <th class="px-4">Status</th>
              <th class="px-4 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-200/60 dark:divide-zinc-800/70">
            <tr
              v-for="channel in data.items"
              :key="channel.id"
              :class="{ 'text-zinc-400': !channel.active }"
            >
              <td class="px-4 font-medium">{{ channel.name }}</td>
              <td class="zahl px-4">{{ formatPercent(channel.feePercent) }}</td>
              <td class="zahl px-4">{{ formatMoney(channel.feeFixed) }}</td>
              <td class="px-4 text-zinc-500">
                {{ channel.pricingRule === 'same_margin' ? 'aus Zielmarge' : 'fest' }}
              </td>
              <td class="px-4">
                <UButton
                  size="xs"
                  variant="ghost"
                  :color="channel.active ? 'success' : 'neutral'"
                  :icon="channel.active ? 'i-lucide-check' : 'i-lucide-minus'"
                  class="rounded-[8px]"
                  :title="
                    channel.active
                      ? 'Steht zur Preisberechnung zur Verfügung. Klicken zum Deaktivieren.'
                      : 'Steht nicht zur Verfügung. Klicken zum Aktivieren.'
                  "
                  @click="toggleActive(channel)"
                >
                  {{ channel.active ? 'aktiv' : 'inaktiv' }}
                </UButton>
              </td>
              <td class="px-4 text-right">
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-pencil"
                  :aria-label="`${channel.name} bearbeiten`"
                  class="rounded-[8px]"
                  @click="openDialog(channel)"
                >
                  Bearbeiten
                </UButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal
      v-model:open="dialogOpen"
      :title="editingId ? 'Kanal bearbeiten' : 'Kanal anlegen'"
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
            label="Gebühr prozentual"
            :error="fieldErrors.feePercent"
            help="Anteil vom Verkaufspreis. Zum Beispiel 6,5"
          >
            <UInput v-model="form.feePercent" class="w-full" placeholder="0" />
          </UFormField>
          <UFormField
            label="Gebühr fix"
            :error="fieldErrors.feeFixed"
            help="Betrag je Verkauf. Zum Beispiel 0,20"
          >
            <UInput v-model="form.feeFixed" class="w-full" placeholder="0,00" />
          </UFormField>
          <UFormField label="Preisregel">
            <USelectMenu
              v-model="form.pricingRule"
              :items="ruleOptions"
              value-key="value"
              class="w-full"
            />
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

<script setup lang="ts">
import type { List, VatCategory, VatRate } from '~~/shared/types/api';

useHead({ title: 'MwSt-Sätze' });

const { formatPercent, formatDate, rateToInput } = useMoney();
const { readError } = useApiError();

const { data, pending, refresh } = await useFetch<List<VatRate>>('/api/vat-rates');

const categoryOptions = [
  { label: 'Normal', value: 'standard' },
  { label: 'Ermäßigt', value: 'reduced' },
];
const categoryLabel = (category: VatCategory) => (category === 'reduced' ? 'Ermäßigt' : 'Normal');

/** Per country and category, the latest rate that is already valid. */
const currentIds = computed(() => {
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set<string>();
  const ids = new Set<string>();
  for (const rate of data.value?.items ?? []) {
    const key = `${rate.country}-${rate.vatCategory}`;
    if (!seen.has(key) && rate.validFrom <= today) {
      seen.add(key);
      ids.add(rate.id);
    }
  }
  return ids;
});

const dialogOpen = ref(false);
const saving = ref(false);
const message = ref<string | null>(null);
const fieldErrors = ref<Record<string, string>>({});

const editing = ref<VatRate | null>(null);
const form = reactive({
  country: '',
  vatCategory: 'standard' as VatCategory,
  rate: '',
  validFrom: new Date().toISOString().slice(0, 10),
});

function openDialog(rate?: VatRate) {
  message.value = null;
  fieldErrors.value = {};
  editing.value = rate ?? null;
  form.country = rate?.country ?? '';
  form.vatCategory = rate?.vatCategory ?? 'standard';
  form.rate = rate ? rateToInput(rate.rate) : '';
  form.validFrom = rate?.validFrom ?? new Date().toISOString().slice(0, 10);
  dialogOpen.value = true;
}

async function save() {
  saving.value = true;
  message.value = null;
  fieldErrors.value = {};
  try {
    if (editing.value) {
      await $fetch(`/api/vat-rates/${editing.value.id}`, {
        method: 'PATCH',
        body: { rate: form.rate, validFrom: form.validFrom },
      });
    } else {
      await $fetch('/api/vat-rates', { method: 'POST', body: { ...form } });
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
</script>

<template>
  <div>
    <SeitenKopf
      titel="MwSt-Sätze"
      hinweis="Je Lieferland und Kategorie. Bei einer Gesetzesänderung einen neuen Satz mit späterem Datum anlegen."
    >
      <template #aktionen>
        <UButton icon="i-lucide-plus" size="sm" class="rounded-[8px]" @click="openDialog()">
          Satz anlegen
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
              <th class="px-4">Land</th>
              <th class="px-4">Kategorie</th>
              <th class="px-4 text-right">Satz</th>
              <th class="px-4 text-right">Gültig ab</th>
              <th class="px-4">Status</th>
              <th class="px-4 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-leinen-200/60">
            <tr
              v-for="rate in data?.items"
              :key="rate.id"
              :class="{ 'text-leinen-400': !currentIds.has(rate.id) }"
            >
              <td class="px-4 font-mono">{{ rate.country }}</td>
              <td class="px-4">{{ categoryLabel(rate.vatCategory) }}</td>
              <td class="zahl px-4">{{ formatPercent(rate.rate) }}</td>
              <td class="zahl px-4">{{ formatDate(rate.validFrom) }}</td>
              <td class="px-4">
                <UBadge v-if="currentIds.has(rate.id)" size="sm" color="primary" variant="subtle" class="rounded-[8px]">
                  aktuell
                </UBadge>
              </td>
              <td class="px-4 text-right">
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-pencil"
                  :aria-label="`${rate.country} ${categoryLabel(rate.vatCategory)} bearbeiten`"
                  class="rounded-[8px]"
                  @click="openDialog(rate)"
                >
                  Bearbeiten
                </UButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-3 text-xs text-leinen-500">
        Startwerte bitte mit der Steuerberatung abgleichen, besonders für Lieferungen ins EU-Ausland.
      </p>
    </div>

    <UModal v-model:open="dialogOpen" :title="editing ? 'Satz korrigieren' : 'Satz anlegen'">
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
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Land" required :error="fieldErrors.country" help="Zwei Buchstaben, z. B. DE.">
              <UInput v-model="form.country" :disabled="!!editing" maxlength="2" class="w-full font-mono uppercase" />
            </UFormField>
            <UFormField label="Kategorie" :error="fieldErrors.vatCategory">
              <USelectMenu
                v-model="form.vatCategory"
                :items="categoryOptions"
                value-key="value"
                :disabled="!!editing"
                class="w-full"
              />
            </UFormField>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Satz in %" required :error="fieldErrors.rate" help="Zum Beispiel 19 oder 5,5.">
              <UInput v-model="form.rate" class="w-full" />
            </UFormField>
            <UFormField label="Gültig ab" required :error="fieldErrors.validFrom">
              <UInput v-model="form.validFrom" type="date" class="w-full" />
            </UFormField>
          </div>
          <p v-if="editing" class="text-xs text-leinen-500">
            Nur für Korrekturen. Ändert sich der Satz per Gesetz, besser einen neuen Satz mit dem
            neuen Datum anlegen – so bleiben ältere Verkäufe richtig.
          </p>
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

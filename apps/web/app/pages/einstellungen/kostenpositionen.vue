<script setup lang="ts">
import type { CostItem, List } from '~~/shared/types/api';

useHead({ title: 'Kostenpositionen' });

const { formatMoney, formatPercent, toInput, rateToInput } = useMoney();
const { readError } = useApiError();

const { data, pending, refresh } = await useFetch<List<CostItem>>('/api/cost-items');

const dialogOpen = ref(false);
const saving = ref(false);
const message = ref<string | null>(null);
const fieldErrors = ref<Record<string, string>>({});

const editingId = ref<string | null>(null);
const form = reactive({
  label: '',
  kind: 'fix' as 'fix' | 'percent',
  value: '',
  inputTaxDeductible: false,
  distributionMethod: 'value' as 'value' | 'quantity',
});

const kindOptions = [
  { label: 'Fixbetrag', value: 'fix' },
  { label: 'Prozentsatz', value: 'percent' },
];

const distributionOptions = [
  { label: 'nach Warenwert', value: 'value' },
  { label: 'nach Stückzahl', value: 'quantity' },
];

/** Stored values back to input format (cents → "21,50", rate → "6,5"). */
function valueToInput(item: CostItem): string {
  if (item.value === null) return '';
  return item.kind === 'fix' ? toInput(item.value) : rateToInput(item.value);
}

function openDialog(item?: CostItem) {
  message.value = null;
  fieldErrors.value = {};
  editingId.value = item?.id ?? null;
  form.label = item?.label ?? '';
  form.kind = item?.kind ?? 'fix';
  form.value = item ? valueToInput(item) : '';
  form.inputTaxDeductible = item?.inputTaxDeductible ?? false;
  form.distributionMethod = item?.distributionMethod ?? 'value';
  dialogOpen.value = true;
}

async function save() {
  saving.value = true;
  message.value = null;
  fieldErrors.value = {};
  // `kind` is always sent; it decides how `value` is read.
  const body = {
    label: form.label,
    kind: form.kind,
    value: form.value,
    inputTaxDeductible: form.inputTaxDeductible,
    distributionMethod: form.distributionMethod,
  };
  try {
    if (editingId.value) {
      await $fetch(`/api/cost-items/${editingId.value}`, { method: 'PATCH', body });
    } else {
      await $fetch('/api/cost-items', { method: 'POST', body });
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

async function toggleActive(item: CostItem) {
  try {
    await $fetch(`/api/cost-items/${item.id}`, {
      method: 'PATCH',
      body: { kind: item.kind, active: !item.active },
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
      titel="Kostenpositionen"
      hinweis="Zuschläge auf den Einstandspreis. Übergreifende Positionen gelten für alle Produkte."
    >
      <template #aktionen>
        <UButton icon="i-lucide-plus" size="sm" class="rounded-[8px]" @click="openDialog()">
          Position anlegen
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

      <div
        class="mb-4 rounded-[12px] border border-trdwarning-200 bg-trdwarning-50/50 px-4 py-3 text-sm dark:border-trdwarning-900 dark:bg-trdwarning-950/30"
        style="border-width: 0.5px"
      >
        <p class="font-medium">Vorsteuer und Selbstkosten</p>
        <p class="mt-0.5 text-leinen-600 dark:text-leinen-400">
          Einfuhrumsatzsteuer ist als Vorsteuer abziehbar und zählt nicht zu den
          Selbstkosten. Zoll ist nicht abziehbar und zählt mit. Markieren Sie
          abziehbare Positionen entsprechend.
        </p>
      </div>

      <div v-if="pending && !data" class="py-12 text-center text-sm text-leinen-500">
        Wird geladen …
      </div>

      <div
        v-else-if="!data?.items.length"
        class="rounded-[12px] border border-leinen-200/70 bg-white dark:bg-leinen-900 py-16 text-center dark:border-leinen-800"
        style="border-width: 0.5px"
      >
        <p class="text-sm font-medium">Noch keine Kostenpositionen angelegt.</p>
        <p class="mt-1 text-sm text-leinen-500">
          Typisch sind Verpackung, Zoll und Einfuhrumsatzsteuer.
        </p>
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
              <th class="px-4">Bezeichnung</th>
              <th class="px-4">Geltung</th>
              <th class="px-4 text-right">Wert</th>
              <th class="px-4">Vorsteuer</th>
              <th class="px-4">Verteilung</th>
              <th class="px-4">Status</th>
              <th class="px-4 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-leinen-200/60 dark:divide-leinen-800/70">
            <tr v-for="item in data.items" :key="item.id" :class="{ 'text-leinen-400': !item.active }">
              <td class="px-4 font-medium">{{ item.label }}</td>
              <td class="px-4 text-leinen-500">
                {{ item.variantId ? 'Variante' : 'übergreifend' }}
              </td>
              <td class="zahl px-4">
                {{ item.kind === 'fix' ? formatMoney(item.value) : formatPercent(item.value) }}
              </td>
              <td class="px-4">
                <UBadge
                  v-if="item.inputTaxDeductible"
                  size="sm"
                  color="success"
                  variant="subtle"
                  class="rounded-[8px]"
                >
                  abziehbar
                </UBadge>
                <span v-else class="text-leinen-400">–</span>
              </td>
              <td class="px-4 text-leinen-500">
                {{ item.distributionMethod === 'value' ? 'Warenwert' : 'Stückzahl' }}
              </td>
              <td class="px-4">
                <UButton
                  size="xs"
                  variant="ghost"
                  :color="item.active ? 'success' : 'neutral'"
                  :icon="item.active ? 'i-lucide-check' : 'i-lucide-minus'"
                  class="rounded-[8px]"
                  :title="
                    item.active
                      ? 'Wird in der Kalkulation berücksichtigt. Klicken zum Deaktivieren.'
                      : 'Wird nicht berücksichtigt. Klicken zum Aktivieren.'
                  "
                  @click="toggleActive(item)"
                >
                  {{ item.active ? 'aktiv' : 'inaktiv' }}
                </UButton>
              </td>
              <td class="px-4 text-right">
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-pencil"
                  :aria-label="`${item.label} bearbeiten`"
                  class="rounded-[8px]"
                  @click="openDialog(item)"
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
      :title="editingId ? 'Kostenposition bearbeiten' : 'Kostenposition anlegen'"
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

          <UFormField label="Bezeichnung" required :error="fieldErrors.label">
            <UInput v-model="form.label" autofocus class="w-full" />
          </UFormField>

          <UFormField label="Art" required>
            <USelectMenu v-model="form.kind" :items="kindOptions" value-key="value" class="w-full" />
          </UFormField>

          <UFormField
            :label="form.kind === 'fix' ? 'Betrag' : 'Satz'"
            required
            :error="fieldErrors.value"
            :help="form.kind === 'fix' ? 'Zum Beispiel 0,85' : 'Zum Beispiel 4,7 für 4,7 Prozent'"
          >
            <UInput v-model="form.value" class="w-full" />
          </UFormField>

          <UFormField
            label="Verteilung der Nebenkosten"
            help="Gilt für Fracht und Zoll, wenn eine Sendung mehrere Chargen enthält."
          >
            <USelectMenu
              v-model="form.distributionMethod"
              :items="distributionOptions"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <UCheckbox v-model="form.inputTaxDeductible" label="Vorsteuerabzugsfähig" />
          <p class="-mt-2 text-xs text-leinen-500">
            Abziehbare Positionen belasten die Marge nicht. Trifft auf die
            Einfuhrumsatzsteuer zu, nicht auf Zoll.
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
              {{ editingId ? 'Speichern' : 'Anlegen' }}
            </UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>

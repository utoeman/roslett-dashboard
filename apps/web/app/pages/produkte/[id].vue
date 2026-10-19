<script setup lang="ts">
import type { ProductDetail, Variant } from '~~/shared/types/api';

const route = useRoute();
const id = computed(() => String(route.params.id));

const { formatMoney, formatPercent, formatDate, toInput } = useMoney();
const { readError } = useApiError();

const { data, pending, error, refresh } = await useFetch<ProductDetail>(
  () => `/api/products/${id.value}`,
);

useHead({ title: () => data.value?.name ?? 'Produkt' });

const saving = ref(false);
const message = ref<string | null>(null);
const fieldErrors = ref<Record<string, string>>({});

/** Product master data, edited in place. */
const editing = ref(false);
const form = reactive({ name: '', category: '', description: '' });

watchEffect(() => {
  if (data.value) {
    form.name = data.value.name;
    form.category = data.value.category ?? '';
    form.description = data.value.description ?? '';
  }
});

async function saveProduct() {
  saving.value = true;
  message.value = null;
  fieldErrors.value = {};
  try {
    await $fetch(`/api/products/${id.value}`, {
      method: 'PATCH',
      body: {
        name: form.name,
        category: form.category || null,
        description: form.description || null,
      },
    });
    editing.value = false;
    await refresh();
  } catch (err) {
    const { message: text, fields } = readError(err);
    message.value = text;
    fieldErrors.value = fields;
  } finally {
    saving.value = false;
  }
}

/** One dialog for create and edit; `editingVariantId` switches to update. */
const variantDialog = ref(false);
const editingVariantId = ref<string | null>(null);
const variantForm = reactive({
  sku: '',
  label: '',
  basePriceNet: '',
  minimumStock: 0,
});

function openVariantDialog(variant?: Variant) {
  message.value = null;
  fieldErrors.value = {};
  editingVariantId.value = variant?.id ?? null;
  variantForm.sku = variant?.sku ?? '';
  variantForm.label = variant?.label ?? '';
  variantForm.basePriceNet = variant ? toInput(variant.basePriceNet) : '';
  variantForm.minimumStock = variant?.minimumStock ?? 0;
  variantDialog.value = true;
}

async function saveVariant() {
  saving.value = true;
  message.value = null;
  fieldErrors.value = {};
  const fields = {
    sku: variantForm.sku,
    label: variantForm.label,
    basePriceNet: variantForm.basePriceNet || null,
    minimumStock: variantForm.minimumStock,
  };
  try {
    await $fetch(`/api/products/${id.value}`, {
      method: 'PATCH',
      body: editingVariantId.value
        ? { updatedVariants: [{ id: editingVariantId.value, ...fields }] }
        : { newVariants: [fields] },
    });
    variantDialog.value = false;
    await refresh();
  } catch (err) {
    const { message: text, fields: errorFields } = readError(err);
    message.value = text;
    // Map list paths back to form fields: "newVariants.0.sku" → "sku".
    fieldErrors.value = Object.fromEntries(
      Object.entries(errorFields).map(([k, v]) => [k.split('.').pop() ?? k, v]),
    );
  } finally {
    saving.value = false;
  }
}

async function archiveVariant(variantId: string, archive: boolean) {
  try {
    await $fetch(`/api/products/${id.value}`, {
      method: 'PATCH',
      body: {
        updatedVariants: [
          {
            id: variantId,
            archivedAt: archive ? new Date().toISOString() : null,
          },
        ],
      },
    });
    await refresh();
  } catch (err) {
    message.value = readError(err).message;
  }
}

const activeVariants = computed(
  () => data.value?.variants.filter((v) => !v.archivedAt) ?? [],
);
const archivedVariants = computed(
  () => data.value?.variants.filter((v) => v.archivedAt) ?? [],
);
</script>

<template>
  <div>
    <div v-if="error" class="p-6">
      <UAlert
        color="error"
        variant="subtle"
        class="rounded-[12px]"
        title="Produkt nicht gefunden"
        description="Das angeforderte Produkt existiert nicht oder wurde entfernt."
      />
      <UButton to="/produkte" variant="ghost" class="mt-4 rounded-[8px]" icon="i-lucide-arrow-left">
        Zurück zur Liste
      </UButton>
    </div>

    <div v-else-if="pending && !data" class="p-6 text-sm text-leinen-500">
      Produkt wird geladen …
    </div>

    <div v-else-if="data">
      <SeitenKopf :titel="data.name" :hinweis="data.category ?? undefined">
        <template #aktionen>
          <UButton
            to="/produkte"
            variant="ghost"
            color="neutral"
            size="sm"
            icon="i-lucide-arrow-left"
            class="rounded-[8px]"
          >
            Alle Produkte
          </UButton>
        </template>
      </SeitenKopf>

      <div class="space-y-6 px-6 py-4">
        <UAlert
          v-if="message && !variantDialog"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          class="rounded-[12px]"
          :description="message"
        />

        <!-- Master data -->
        <section
          class="rounded-[12px] border border-leinen-200/70 bg-white dark:bg-leinen-900 p-4 dark:border-leinen-800"
          style="border-width: 0.5px"
        >
          <div class="mb-3 flex items-center justify-between">
            <h2 class="text-sm font-semibold">Stammdaten</h2>
            <UButton
              v-if="!editing"
              size="xs"
              variant="ghost"
              color="neutral"
              icon="i-lucide-pencil"
              class="rounded-[8px]"
              @click="editing = true"
            >
              Bearbeiten
            </UButton>
          </div>

          <form v-if="editing" class="space-y-3" @submit.prevent="saveProduct">
            <UFormField label="Name" required :error="fieldErrors.name">
              <UInput v-model="form.name" class="w-full" />
            </UFormField>
            <UFormField label="Kategorie">
              <UInput v-model="form.category" class="w-full" />
            </UFormField>
            <UFormField label="Beschreibung">
              <UTextarea v-model="form.description" :rows="3" class="w-full" />
            </UFormField>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                class="rounded-[8px]"
                @click="editing = false"
              >
                Abbrechen
              </UButton>
              <UButton type="submit" :loading="saving" class="rounded-[8px]">
                Speichern
              </UButton>
            </div>
          </form>

          <dl v-else class="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt class="text-xs text-leinen-500">Kategorie</dt>
              <dd>{{ data.category ?? '–' }}</dd>
            </div>
            <div>
              <dt class="text-xs text-leinen-500">Angelegt</dt>
              <dd>{{ formatDate(data.createdAt) }}</dd>
            </div>
            <div class="sm:col-span-2">
              <dt class="text-xs text-leinen-500">Beschreibung</dt>
              <dd>{{ data.description ?? '–' }}</dd>
            </div>
          </dl>
        </section>

        <!-- Variants -->
        <section
          class="overflow-x-auto rounded-[12px] border border-leinen-200/70 bg-white dark:bg-leinen-900 dark:border-leinen-800"
          style="border-width: 0.5px"
        >
          <div class="flex items-center justify-between px-4 py-3">
            <h2 class="text-sm font-semibold">
              Varianten
              <span class="ml-1 font-normal text-leinen-500">
                {{ activeVariants.length }}
              </span>
            </h2>
            <UButton
              size="xs"
              icon="i-lucide-plus"
              class="rounded-[8px]"
              @click="openVariantDialog()"
            >
              Variante
            </UButton>
          </div>

          <table class="trd-tabelle w-full min-w-[44rem] text-sm">
            <thead
              class="border-y border-leinen-200/70 bg-leinen-50/60 text-left text-xs font-medium uppercase tracking-wide text-leinen-500 dark:border-leinen-800 dark:bg-leinen-900/40"
            >
              <tr>
                <th class="px-4">SKU</th>
                <th class="px-4">Bezeichnung</th>
                <th class="px-4 text-right">Basispreis netto</th>
                <th class="px-4 text-right">USt</th>
                <th class="px-4 text-right">Mindestbestand</th>
                <th class="px-4 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-leinen-200/60 dark:divide-leinen-800/70">
              <tr v-for="variant in activeVariants" :key="variant.id">
                <td class="px-4 font-mono text-xs">{{ variant.sku }}</td>
                <td class="px-4">{{ variant.label }}</td>
                <td class="zahl px-4">{{ formatMoney(variant.basePriceNet) }}</td>
                <td class="zahl px-4 text-leinen-500">{{ formatPercent(variant.vatRate) }}</td>
                <td class="zahl px-4 text-leinen-500">{{ variant.minimumStock }}</td>
                <td class="px-4">
                  <div class="flex justify-end gap-1">
                    <UButton
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      icon="i-lucide-pencil"
                      :aria-label="`${variant.sku} bearbeiten`"
                      class="rounded-[8px]"
                      @click="openVariantDialog(variant)"
                    >
                      Bearbeiten
                    </UButton>
                    <UButton
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      icon="i-lucide-archive"
                      :aria-label="`${variant.sku} archivieren`"
                      class="rounded-[8px]"
                      @click="archiveVariant(variant.id, true)"
                    >
                      Archivieren
                    </UButton>
                  </div>
                </td>
              </tr>
              <tr v-for="variant in archivedVariants" :key="variant.id" class="text-leinen-400">
                <td class="px-4 font-mono text-xs">{{ variant.sku }}</td>
                <td class="px-4">
                  {{ variant.label }}
                  <UBadge size="sm" color="neutral" variant="subtle" class="ml-2 rounded-[8px]">
                    archiviert
                  </UBadge>
                </td>
                <td class="zahl px-4">{{ formatMoney(variant.basePriceNet) }}</td>
                <td class="zahl px-4">{{ formatPercent(variant.vatRate) }}</td>
                <td class="zahl px-4">{{ variant.minimumStock }}</td>
                <td class="px-4">
                  <div class="flex justify-end">
                    <UButton
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      icon="i-lucide-archive-restore"
                      :aria-label="`${variant.sku} zurückholen`"
                      class="rounded-[8px]"
                      @click="archiveVariant(variant.id, false)"
                    >
                      Zurückholen
                    </UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- Cost items -->
        <section
          class="overflow-x-auto rounded-[12px] border border-leinen-200/70 bg-white dark:bg-leinen-900 dark:border-leinen-800"
          style="border-width: 0.5px"
        >
          <div class="px-4 py-3">
            <h2 class="text-sm font-semibold">Kostenpositionen</h2>
            <p class="mt-0.5 text-xs text-leinen-500">
              Gültig für dieses Produkt: übergreifende und variantenspezifische
              Positionen. Vorsteuerabzugsfähige Positionen zählen nicht zu den
              Selbstkosten.
            </p>
          </div>

          <p
            v-if="!data.costItems.length"
            class="border-t border-leinen-200/70 px-4 py-6 text-center text-sm text-leinen-500 dark:border-leinen-800"
          >
            Keine Kostenpositionen hinterlegt.
            <NuxtLink
              to="/einstellungen/kostenpositionen"
              class="text-trd-600 underline underline-offset-2 dark:text-trd-400"
            >
              Jetzt anlegen
            </NuxtLink>
          </p>

          <table v-else class="trd-tabelle w-full min-w-[44rem] text-sm">
            <thead
              class="border-y border-leinen-200/70 bg-leinen-50/60 text-left text-xs font-medium uppercase tracking-wide text-leinen-500 dark:border-leinen-800 dark:bg-leinen-900/40"
            >
              <tr>
                <th class="px-4">Bezeichnung</th>
                <th class="px-4">Geltung</th>
                <th class="px-4 text-right">Wert</th>
                <th class="px-4">Vorsteuer</th>
                <th class="px-4 text-right">Verteilung</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-leinen-200/60 dark:divide-leinen-800/70">
              <tr
                v-for="item in data.costItems"
                :key="item.id"
                :class="{ 'text-leinen-400': !item.active }"
              >
                <td class="px-4">
                  {{ item.label }}
                  <UBadge
                    v-if="!item.active"
                    size="sm"
                    color="neutral"
                    variant="subtle"
                    class="ml-2 rounded-[8px]"
                  >
                    inaktiv
                  </UBadge>
                </td>
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
                <td class="px-4 text-right text-leinen-500">
                  {{ item.distributionMethod === 'value' ? 'Warenwert' : 'Stückzahl' }}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <UModal
        v-model:open="variantDialog"
        :title="editingVariantId ? 'Variante bearbeiten' : 'Variante anlegen'"
      >
        <template #body>
          <form class="space-y-4" @submit.prevent="saveVariant">
            <UAlert
              v-if="message"
              color="error"
              variant="subtle"
              icon="i-lucide-circle-alert"
              class="rounded-[12px]"
              :description="message"
            />
            <UFormField label="SKU" required :error="fieldErrors.sku">
              <UInput v-model="variantForm.sku" autofocus class="w-full font-mono" />
            </UFormField>
            <UFormField label="Bezeichnung" required :error="fieldErrors.label">
              <UInput v-model="variantForm.label" class="w-full" />
            </UFormField>
            <UFormField
              label="Basispreis netto"
              :error="fieldErrors.basePriceNet"
              help="Optional. Zum Beispiel 24,90"
            >
              <UInput v-model="variantForm.basePriceNet" class="w-full" />
            </UFormField>
            <UFormField label="Mindestbestand" :error="fieldErrors.minimumStock">
              <UInput
                v-model.number="variantForm.minimumStock"
                type="number"
                min="0"
                class="w-full"
              />
            </UFormField>
            <div class="flex justify-end gap-2 pt-2">
              <UButton
                color="neutral"
                variant="ghost"
                class="rounded-[8px]"
                @click="variantDialog = false"
              >
                Abbrechen
              </UButton>
              <UButton type="submit" :loading="saving" class="rounded-[8px]">
                {{ editingVariantId ? 'Speichern' : 'Anlegen' }}
              </UButton>
            </div>
          </form>
        </template>
      </UModal>
    </div>
  </div>
</template>

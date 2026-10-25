<script setup lang="ts">
import type { CompanySettings } from '~~/shared/types/api';

useHead({ title: 'Hersteller' });

const { formatDate } = useMoney();
const { readError } = useApiError();

const { data, pending } = await useFetch<CompanySettings | null>('/api/company-settings');

const saving = ref(false);
const saved = ref(false);
const message = ref<string | null>(null);
const fieldErrors = ref<Record<string, string>>({});
const form = reactive({ manufacturerName: '', manufacturerAddress: '', manufacturerEmail: '' });

watchEffect(() => {
  if (data.value) {
    form.manufacturerName = data.value.manufacturerName;
    form.manufacturerAddress = data.value.manufacturerAddress;
    form.manufacturerEmail = data.value.manufacturerEmail;
  }
});

async function save() {
  saving.value = true;
  saved.value = false;
  message.value = null;
  fieldErrors.value = {};
  try {
    data.value = await $fetch<CompanySettings>('/api/company-settings', { method: 'PUT', body: form });
    saved.value = true;
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
      titel="Hersteller"
      hinweis="Angaben nach GPSR für Etikett und Shop. Roslett tritt mit eigener Marke als Herstellerin auf."
    />

    <div class="px-6 py-4">
      <div v-if="pending && !data" class="py-12 text-center text-sm text-leinen-500">Wird geladen …</div>

      <form
        v-else
        class="max-w-xl space-y-4 rounded-[12px] border border-leinen-200/70 bg-white p-4"
        style="border-width: 0.5px"
        @submit.prevent="save"
      >
        <UAlert
          v-if="message"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          class="rounded-[12px]"
          :description="message"
        />
        <UAlert
          v-if="!data"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          class="rounded-[12px]"
          description="Noch keine Herstellerangaben hinterlegt. Ohne sie dürfen Produkte in der EU nicht verkauft werden."
        />
        <UFormField label="Name" required :error="fieldErrors.manufacturerName">
          <UInput v-model="form.manufacturerName" class="w-full" placeholder="Roslett" />
        </UFormField>
        <UFormField
          label="Geschäftsadresse"
          required
          :error="fieldErrors.manufacturerAddress"
          help="Postalisch erreichbar, keine Privatadresse."
        >
          <UTextarea v-model="form.manufacturerAddress" :rows="3" class="w-full" />
        </UFormField>
        <UFormField label="E-Mail" required :error="fieldErrors.manufacturerEmail">
          <UInput v-model="form.manufacturerEmail" type="email" class="w-full" />
        </UFormField>
        <div class="flex items-center justify-end gap-3 pt-2">
          <span v-if="saved" class="text-xs text-leinen-500">Gespeichert.</span>
          <span v-else-if="data" class="text-xs text-leinen-500">Zuletzt geändert am {{ formatDate(data.updatedAt) }}</span>
          <UButton type="submit" :loading="saving" class="rounded-[8px]">Speichern</UButton>
        </div>
      </form>
    </div>
  </div>
</template>

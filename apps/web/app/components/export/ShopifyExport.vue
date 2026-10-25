<script setup lang="ts">
/** Builds the Shopify product CSV and shows its warnings before the download. */
interface ShopifyExport {
  csv: string;
  warnings: string[];
  products: number;
  variants: number;
}

const { readError } = useApiError();

const open = ref(false);
const loading = ref(false);
const message = ref<string | null>(null);
const result = ref<ShopifyExport | null>(null);

async function prepare() {
  open.value = true;
  loading.value = true;
  message.value = null;
  result.value = null;
  try {
    result.value = await $fetch<ShopifyExport>('/api/export/shopify-products');
  } catch (err) {
    message.value = readError(err).message;
  } finally {
    loading.value = false;
  }
}

function download() {
  if (!result.value) return;
  const url = URL.createObjectURL(new Blob([result.value.csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `roslett-shopify-produkte-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <UButton icon="i-lucide-file-down" size="sm" variant="outline" class="rounded-[8px]" @click="prepare">
    Shopify-CSV
  </UButton>

  <UModal v-model:open="open" title="Export für Shopify">
    <template #body>
      <div class="space-y-4 text-sm">
        <p v-if="loading" class="text-leinen-500">Wird erstellt …</p>
        <UAlert
          v-else-if="message"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          class="rounded-[12px]"
          :description="message"
        />
        <template v-else-if="result">
          <p>
            {{ result.products }} Produkte mit {{ result.variants }} Varianten, als Entwurf und nicht veröffentlicht.
            Import in Shopify unter Produkte → Importieren.
          </p>
          <UAlert
            v-if="result.warnings.length"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            class="rounded-[12px]"
            :title="`${result.warnings.length} Hinweise`"
          >
            <template #description>
              <ul class="list-disc space-y-0.5 pl-4">
                <li v-for="warning in result.warnings" :key="warning">{{ warning }}</li>
              </ul>
            </template>
          </UAlert>
          <p class="text-xs text-leinen-500">
            Nicht im CSV, weil Shopify es dort nicht annimmt: Bestandsmengen, Faser je Variante, Herkunftsland und
            HS-Code. Diese kommen mit der Shopify-Anbindung.
          </p>
          <div class="flex justify-end gap-2 pt-2">
            <UButton color="neutral" variant="ghost" class="rounded-[8px]" @click="open = false">Schließen</UButton>
            <UButton icon="i-lucide-download" class="rounded-[8px]" @click="download">CSV herunterladen</UButton>
          </div>
        </template>
      </div>
    </template>
  </UModal>
</template>

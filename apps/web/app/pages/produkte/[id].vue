<script setup lang="ts">
import type {
  Color,
  List,
  ProductDetail,
  ShopifyProductPreview,
  ShopifyImage,
  ShopifyImageAssigned,
  ShopifyImageAttached,
  ShopifyProductPushResult,
  ShopifyStagedUpload,
  Variant,
} from '~~/shared/types/api';

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
const form = reactive({
  name: '',
  description: '',
  basePriceGross: '',
  vatCategory: 'standard' as 'standard' | 'reduced',
  careNotes: '',
  safetyNotes: '',
});
// Fiber labelling only applies to textiles; origin and HS code to everything.
const isTextile = computed(() => data.value?.category.group === 'textile');
const vatOptions = [
  { label: 'Normal', value: 'standard' },
  { label: 'Ermäßigt', value: 'reduced' },
];
const vatLabel = (category: string) => (category === 'reduced' ? 'Ermäßigt' : 'Normal');

watchEffect(() => {
  if (data.value) {
    form.name = data.value.name;
    form.description = data.value.description ?? '';
    form.basePriceGross = toInput(data.value.basePriceGross);
    form.vatCategory = data.value.vatCategory;
    form.careNotes = data.value.careNotes ?? '';
    form.safetyNotes = data.value.safetyNotes ?? '';
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
        description: form.description || null,
        basePriceGross: form.basePriceGross || null,
        vatCategory: form.vatCategory,
        careNotes: form.careNotes,
        safetyNotes: form.safetyNotes,
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
const { data: colors } = await useFetch<List<Color>>('/api/colors');
const colorOptions = computed(
  () => colors.value?.items.map((c) => ({ label: `${c.code} · ${c.name}`, value: c.id })) ?? [],
);

const { channels, totalCost } = await useChannelMargins();

/** Cost figures of one variant for the margin preview. */
function variantCosts(v: Variant) {
  const landed = v.inventory?.averageCostEur ?? null;
  return {
    landed,
    purchase: v.inventory?.averagePurchaseEur ?? null,
    total: totalCost(landed, v.id, data.value?.costItems ?? []),
  };
}

/** Landed costs of the active variants that use the base price; feeds the margin preview. */
const baseCosts = computed(
  () => data.value?.variants.filter((v) => v.archivedAt === null && v.priceGross === null).map(variantCosts) ?? [],
);

const variantDialog = ref(false);
const editingVariant = ref<Variant | null>(null);
const variantForm = reactive({
  colorId: undefined as string | undefined,
  size: '',
  priceGross: '',
  minimumStock: 0,
  fiber: '',
  fiberFilling: '',
  originCountry: '',
  hsCode: '',
  weightGrams: '',
});

function openVariantDialog(variant?: Variant) {
  message.value = null;
  fieldErrors.value = {};
  editingVariant.value = variant ?? null;
  variantForm.colorId = undefined;
  variantForm.size = '';
  variantForm.priceGross = variant ? toInput(variant.priceGross) : '';
  variantForm.minimumStock = variant?.minimumStock ?? 0;
  variantForm.fiber = variant?.fiber ?? '';
  variantForm.fiberFilling = variant?.fiberFilling ?? '';
  variantForm.originCountry = variant?.originCountry ?? '';
  variantForm.hsCode = variant?.hsCode ?? '';
  variantForm.weightGrams = variant?.weightGrams ? String(variant.weightGrams) : '';
  variantDialog.value = true;
}

async function saveVariant() {
  saving.value = true;
  message.value = null;
  fieldErrors.value = {};
  const common = {
    priceGross: variantForm.priceGross || null,
    minimumStock: variantForm.minimumStock,
    fiber: variantForm.fiber,
    fiberFilling: variantForm.fiberFilling,
    originCountry: variantForm.originCountry,
    hsCode: variantForm.hsCode,
    // Empty clears the weight.
    weightGrams: variantForm.weightGrams.trim() === '' ? null : Number(variantForm.weightGrams),
  };
  try {
    await $fetch(`/api/products/${id.value}`, {
      method: 'PATCH',
      body: editingVariant.value
        ? { updatedVariants: [{ id: editingVariant.value.id, ...common }] }
        : { newVariants: [{ colorId: variantForm.colorId ?? null, size: variantForm.size || null, ...common }] },
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
// The whole product: archive, restore, and delete once archived and never used (G25).
const productBusy = ref(false);
const deleteProductOpen = ref(false);
const deleteProductMessage = ref<string | null>(null);

async function setProductArchived(archive: boolean) {
  productBusy.value = true;
  message.value = null;
  try {
    await $fetch(`/api/products/${id.value}`, {
      method: 'PATCH',
      body: { archivedAt: archive ? new Date().toISOString() : null },
    });
    await refresh();
  } catch (err) {
    message.value = readError(err).message;
  } finally {
    productBusy.value = false;
  }
}

function askDeleteProduct() {
  deleteProductMessage.value = null;
  deleteProductOpen.value = true;
}

async function confirmDeleteProduct() {
  productBusy.value = true;
  deleteProductMessage.value = null;
  try {
    await $fetch(`/api/products/${id.value}`, { method: 'DELETE' });
    deleteProductOpen.value = false;
    await navigateTo('/produkte');
  } catch (err) {
    deleteProductMessage.value = readError(err).message;
  } finally {
    productBusy.value = false;
  }
}

// Deleting is only possible for archived variants that were never booked; the server checks.
const deletingVariant = ref<Variant | null>(null);
const deleteVariantOpen = computed({
  get: () => deletingVariant.value !== null,
  set: (open: boolean) => {
    if (!open) deletingVariant.value = null;
  },
});
const deleteVariantBusy = ref(false);
const deleteVariantMessage = ref<string | null>(null);

function askDeleteVariant(variant: Variant) {
  deleteVariantMessage.value = null;
  deletingVariant.value = variant;
}

async function confirmDeleteVariant() {
  if (deletingVariant.value === null) return;
  deleteVariantBusy.value = true;
  deleteVariantMessage.value = null;
  try {
    await $fetch(`/api/products/${id.value}/variants/${deletingVariant.value.id}`, { method: 'DELETE' });
    deletingVariant.value = null;
    await refresh();
  } catch (err) {
    deleteVariantMessage.value = readError(err).message;
  } finally {
    deleteVariantBusy.value = false;
  }
}

const archivedVariants = computed(
  () => data.value?.variants.filter((v) => v.archivedAt) ?? [],
);

// --- Shopify (stage 3a) -------------------------------------------------------
const shopifyOpen = ref(false);
const shopifyLoading = ref(false);
const shopifyPreview = ref<ShopifyProductPreview | null>(null);
const shopifyMessage = ref<string | null>(null);
const shopifyDone = ref<ShopifyProductPushResult | null>(null);

async function openShopify() {
  shopifyOpen.value = true;
  shopifyLoading.value = true;
  shopifyMessage.value = null;
  shopifyDone.value = null;
  shopifyPreview.value = null;
  try {
    shopifyPreview.value = await $fetch<ShopifyProductPreview>(`/api/products/${id.value}/shopify`);
  } catch (err) {
    shopifyMessage.value = readError(err).message;
  } finally {
    shopifyLoading.value = false;
  }
}

// --- Shopify images (stage 3b, G2) ---------------------------------------------
const images = ref<ShopifyImage[]>([]);
const imagesAvailable = ref(false);
const imagesUploading = ref(false);
const imagesProgress = ref('');
const imagesMessage = ref<string | null>(null);
/** Colours of the active variants; an image picked for one becomes the picture of all its sizes. */
const imageColors = computed(() => {
  const colors = new Map<string, string>();
  for (const v of activeVariants.value) if (v.color) colors.set(v.color.id, v.color.name);
  return [...colors].map(([value, label]) => ({ value, label }));
});
// 'none' instead of undefined or '': the select needs a non-empty value to show and pick it.
const NO_COLOR = 'none';
const imageColor = ref(NO_COLOR);

async function loadImages() {
  try {
    images.value = await $fetch<ShopifyImage[]>(`/api/products/${id.value}/images`);
    imagesAvailable.value = true;
    imagesMessage.value = null;
  } catch (err) {
    imagesAvailable.value = false;
    imagesMessage.value = readError(err).message;
  }
}
onMounted(loadImages);

function imageAlt(): string {
  const color = imageColors.value.find((c) => c.value === imageColor.value)?.label;
  return color ? `${data.value?.name ?? ''}, ${color}` : (data.value?.name ?? '');
}

/** Shopify accepts the colour only after processing the image, so ask again for up to 30 seconds. */
async function assignColor(mediaId: string, colorId: string, name: string) {
  imagesProgress.value = `${name}: wird der Farbe zugeordnet …`;
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = await $fetch<ShopifyImageAssigned>(`/api/products/${id.value}/images/assign`, {
      method: 'POST',
      body: { mediaId, colorId },
    });
    if (result.ready) {
      images.value = result.images;
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`${name}: Shopify verarbeitet das Bild noch; die Farbe bitte später in Shopify zuordnen.`);
}

/** The file goes from the browser straight to Shopify; the dashboard never receives it. */
async function uploadImages(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = '';
  if (files.length === 0) return;
  imagesUploading.value = true;
  imagesMessage.value = null;
  try {
    for (const [index, file] of files.entries()) {
      imagesProgress.value = `${index + 1} von ${files.length} …`;
      const target = await $fetch<ShopifyStagedUpload>(`/api/products/${id.value}/images/staged`, {
        method: 'POST',
        body: { filename: file.name, mimeType: file.type, fileSize: file.size },
      });
      const form = new FormData();
      for (const p of target.parameters) form.append(p.name, p.value);
      form.append('file', file);
      const upload = await fetch(target.url, { method: 'POST', body: form });
      if (!upload.ok) throw new Error(`${file.name}: Upload zu Shopify fehlgeschlagen (HTTP ${upload.status}).`);
      const attached = await $fetch<ShopifyImageAttached>(`/api/products/${id.value}/images`, {
        method: 'POST',
        // Alt text for accessibility and image search; can be refined in Shopify.
        body: { resourceUrl: target.resourceUrl, alt: imageAlt() },
      });
      images.value = attached.images;
      if (imageColor.value !== NO_COLOR && attached.mediaId) await assignColor(attached.mediaId, imageColor.value, file.name);
    }
  } catch (err) {
    imagesMessage.value = err instanceof Error && !('data' in err) ? err.message : readError(err).message;
  } finally {
    imagesUploading.value = false;
  }
}

async function pushShopify() {
  shopifyLoading.value = true;
  shopifyMessage.value = null;
  try {
    shopifyDone.value = await $fetch<ShopifyProductPushResult>(`/api/products/${id.value}/shopify`, { method: 'POST' });
    shopifyPreview.value = null;
  } catch (err) {
    shopifyMessage.value = readError(err).message;
  } finally {
    shopifyLoading.value = false;
  }
}
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
      <SeitenKopf :titel="data.name" :hinweis="`${data.category.name} · Nr. ${data.number}`">
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
          <UButton
            icon="i-lucide-upload"
            size="sm"
            variant="outline"
            color="neutral"
            class="rounded-[8px]"
            @click="openShopify"
          >
            Nach Shopify übertragen
          </UButton>
          <UButton
            v-if="!data.archivedAt"
            icon="i-lucide-archive"
            size="sm"
            variant="ghost"
            color="neutral"
            class="rounded-[8px]"
            :loading="productBusy"
            @click="setProductArchived(true)"
          >
            Produkt archivieren
          </UButton>
          <template v-else>
            <UBadge color="neutral" variant="subtle" class="rounded-[8px]">archiviert</UBadge>
            <UButton
              icon="i-lucide-archive-restore"
              size="sm"
              variant="ghost"
              color="neutral"
              class="rounded-[8px]"
              :loading="productBusy"
              @click="setProductArchived(false)"
            >
              Zurückholen
            </UButton>
            <UButton icon="i-lucide-trash-2" size="sm" variant="ghost" color="error" class="rounded-[8px]" @click="askDeleteProduct">
              Produkt löschen
            </UButton>
          </template>
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
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="Preis brutto" :error="fieldErrors.basePriceGross" help="Zum Beispiel 39,90">
                <BetragFeld v-model="form.basePriceGross" class="w-full" />
              </UFormField>
              <UFormField label="MwSt" :error="fieldErrors.vatCategory">
                <USelectMenu v-model="form.vatCategory" :items="vatOptions" value-key="value" class="w-full" />
              </UFormField>
            </div>
            <MargeVorschau
              :price="form.basePriceGross"
              :vat-rate="data.vatRates[form.vatCategory]"
              :costs="baseCosts"
              :channels="channels"
            />
            <UFormField label="Beschreibung">
              <UTextarea v-model="form.description" :rows="3" class="w-full" />
            </UFormField>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="Pflegehinweise" :error="fieldErrors.careNotes" help="Für die Verpackung, auf Deutsch.">
                <UTextarea v-model="form.careNotes" :rows="3" class="w-full" />
              </UFormField>
              <UFormField label="Sicherheitshinweise" :error="fieldErrors.safetyNotes" help="Nur wenn nötig.">
                <UTextarea v-model="form.safetyNotes" :rows="3" class="w-full" />
              </UFormField>
            </div>
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
              <dd>{{ data.category.code }} · {{ data.category.name }}</dd>
            </div>
            <div>
              <dt class="text-xs text-leinen-500">Produktnummer</dt>
              <dd class="font-mono tabular-nums">{{ String(data.number).padStart(4, '0') }}</dd>
            </div>
            <div>
              <dt class="text-xs text-leinen-500">Preis brutto</dt>
              <dd class="font-mono tabular-nums">{{ formatMoney(data.basePriceGross) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-leinen-500">MwSt</dt>
              <dd>{{ vatLabel(data.vatCategory) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-leinen-500">Angelegt</dt>
              <dd>{{ formatDate(data.createdAt) }}</dd>
            </div>
            <div class="sm:col-span-2">
              <dt class="text-xs text-leinen-500">Beschreibung</dt>
              <dd>{{ data.description ?? '–' }}</dd>
            </div>
            <div>
              <dt class="text-xs text-leinen-500">Pflegehinweise</dt>
              <dd class="whitespace-pre-line">{{ data.careNotes ?? '–' }}</dd>
            </div>
            <div>
              <dt class="text-xs text-leinen-500">Sicherheitshinweise</dt>
              <dd class="whitespace-pre-line">{{ data.safetyNotes ?? '–' }}</dd>
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

          <table class="ros-tabelle w-full min-w-[60rem] text-sm">
            <thead
              class="border-y border-leinen-200/70 bg-leinen-50/60 text-left text-xs font-medium uppercase tracking-wide text-leinen-500 dark:border-leinen-800 dark:bg-leinen-900/40"
            >
              <tr>
                <th class="px-4">SKU</th>
                <th class="px-4">Variante</th>
                <th class="px-4 text-right">Preis brutto</th>
                <th class="px-4 text-right">Bestand</th>
                <th class="px-4 text-right">Ø Einstand</th>
                <th class="px-4 text-right">Lagerwert</th>
                <th class="px-4 text-right" title="Preis netto minus Ø Einstand, vor Kanalgebühren und Kostenpositionen">
                  Marge vor Gebühren
                </th>
                <th class="px-4 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-leinen-200/60 dark:divide-leinen-800/70">
              <tr v-for="variant in activeVariants" :key="variant.id">
                <td class="px-4 font-mono text-xs">{{ variant.sku }}</td>
                <td class="px-4">
                  {{ variant.label }}
                  <div v-if="variant.fiber" class="text-xs text-leinen-500">
                    {{ variant.fiber }}<template v-if="variant.fiberFilling"> · Füllung {{ variant.fiberFilling }}</template>
                  </div>
                </td>
                <td class="zahl px-4">
                  {{ formatMoney(variant.priceGross ?? data.basePriceGross) }}
                  <span v-if="variant.priceGross === null" class="text-xs text-leinen-400">(Basis)</span>
                </td>
                <td class="zahl px-4">
                  <NuxtLink
                    :to="`/journal?variantId=${variant.id}`"
                    class="hover:text-ros-600"
                    :aria-label="`Journal ${variant.sku}`"
                  >
                    {{ variant.inventory?.stock ?? 0 }}
                  </NuxtLink>
                  <div
                    v-if="variant.minimumStock > 0"
                    class="text-xs"
                    :class="variant.inventory?.belowMinimum ? 'text-amber-700' : 'text-leinen-400'"
                  >
                    min {{ variant.minimumStock }}
                  </div>
                </td>
                <td class="zahl px-4">{{ formatMoney(variant.inventory?.averageCostEur) }}</td>
                <td class="zahl px-4">{{ formatMoney(variant.inventory?.stockValueEur) }}</td>
                <td class="zahl px-4" :class="(variant.inventory?.marginEur ?? 0) < 0 ? 'text-red-700' : ''">
                  {{ formatMoney(variant.inventory?.marginEur) }}
                  <div class="text-xs text-leinen-500">{{ formatPercent(variant.inventory?.margin) }}</div>
                </td>
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
                <td class="zahl px-4">{{ formatMoney(variant.priceGross ?? data.basePriceGross) }}</td>
                <td class="zahl px-4">{{ variant.inventory?.stock ?? 0 }}</td>
                <td class="zahl px-4">{{ formatMoney(variant.inventory?.averageCostEur) }}</td>
                <td class="zahl px-4">{{ formatMoney(variant.inventory?.stockValueEur) }}</td>
                <td class="zahl px-4">–</td>
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
                    <UButton
                      size="xs"
                      variant="ghost"
                      color="error"
                      icon="i-lucide-trash-2"
                      :aria-label="`${variant.sku} löschen`"
                      class="rounded-[8px]"
                      @click="askDeleteVariant(variant)"
                    >
                      Löschen
                    </UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <p class="border-t border-leinen-200/70 px-4 py-2 text-xs text-leinen-500 dark:border-leinen-800">
            Marge vor Gebühren: Verkaufspreis ohne MwSt minus Ø Einstand (EK + Nebenkosten) des
            Lagerbestands. Kanalgebühren, Verpackung und Versand sind noch nicht abgezogen. Bestand
            anklicken öffnet das Journal.
          </p>
        </section>

        <!-- Shopify images (stage 3b) -->
        <section
          class="rounded-[12px] border border-leinen-200/70 bg-white px-4 py-3 dark:bg-leinen-900 dark:border-leinen-800"
          style="border-width: 0.5px"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-sm font-semibold">Bilder in Shopify</h2>
              <p class="mt-0.5 text-xs text-leinen-500">
                Werden direkt zu Shopify hochgeladen. Mit Farbe zeigt der Shop das Bild bei allen Größen dieser Farbe.
                Reihenfolge und Alt-Texte pflegen Sie in Shopify.
              </p>
            </div>
            <div v-if="imagesAvailable" class="flex flex-wrap items-center gap-2">
            <USelectMenu
              v-if="imageColors.length > 0"
              v-model="imageColor"
              :items="[{ value: NO_COLOR, label: 'Farbe: keine' }, ...imageColors.map((c) => ({ ...c, label: `Farbe: ${c.label}` }))]"
              value-key="value"
              size="sm"
              class="w-44"
              aria-label="Bild gehört zu Farbe"
            />
            <label class="cursor-pointer">
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple class="sr-only" @change="uploadImages">
              <span
                class="inline-flex items-center gap-1.5 rounded-[8px] border border-leinen-300 px-2.5 py-1.5 text-sm dark:border-leinen-700"
              >
                <UIcon :name="imagesUploading ? 'i-lucide-loader' : 'i-lucide-image-plus'" :class="{ 'animate-spin': imagesUploading }" />
                {{ imagesUploading ? imagesProgress : 'Bilder hochladen' }}
              </span>
            </label>
            </div>
          </div>
          <UAlert v-if="imagesMessage" color="warning" variant="subtle" class="mt-3 rounded-[12px]" :description="imagesMessage" />
          <div v-if="images.length" class="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            <div
              v-for="image in images"
              :key="image.id"
              class="relative flex aspect-square items-center justify-center overflow-hidden rounded-[8px] bg-leinen-100 dark:bg-leinen-800"
            >
              <img v-if="image.url" :src="image.url" :alt="image.alt ?? ''" class="h-full w-full object-cover">
              <span v-else class="text-xs text-leinen-500">{{ image.status === 'FAILED' ? 'fehlgeschlagen' : 'wird verarbeitet' }}</span>
              <span
                v-if="image.colors.length"
                class="absolute bottom-1 left-1 rounded-[6px] bg-white/90 px-1.5 py-0.5 text-[11px] dark:bg-leinen-900/90"
              >
                {{ image.colors.join(', ') }}
              </span>
            </div>
          </div>
          <p v-else-if="imagesAvailable" class="mt-3 text-sm text-leinen-500">Noch keine Bilder in Shopify.</p>
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
              class="text-ros-600 underline underline-offset-2 dark:text-ros-400"
            >
              Jetzt anlegen
            </NuxtLink>
          </p>

          <table v-else class="ros-tabelle w-full min-w-[44rem] text-sm">
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
        :title="editingVariant ? 'Variante bearbeiten' : 'Variante anlegen'"
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
            <dl
              v-if="editingVariant"
              class="grid grid-cols-2 gap-2 rounded-[8px] bg-leinen-50 px-3 py-2 text-sm dark:bg-leinen-900"
            >
              <div>
                <dt class="text-xs text-leinen-500">SKU</dt>
                <dd class="font-mono text-xs">{{ editingVariant.sku }}</dd>
              </div>
              <div>
                <dt class="text-xs text-leinen-500">Variante</dt>
                <dd>{{ editingVariant.label }}</dd>
              </div>
            </dl>
            <template v-else>
              <UFormField label="Farbe" :error="fieldErrors.colorId" help="Optional.">
                <USelectMenu
                  v-model="variantForm.colorId"
                  :items="colorOptions"
                  value-key="value"
                  placeholder="Ohne Farbe"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Größe" :error="fieldErrors.size" help="Optional. Zum Beispiel 45×45 oder M">
                <UInput v-model="variantForm.size" class="w-full" />
              </UFormField>
              <p class="text-xs text-leinen-500">
                Die SKU wird aus Kategorie, Produktnummer, Farbe und Größe gebildet
                und ist danach fest.
              </p>
            </template>
            <!-- New variants get their price after the first receipt (G31). -->
            <template v-if="editingVariant">
              <UFormField
                label="Preis brutto"
                :error="fieldErrors.priceGross"
                help="Nur bei Abweichung vom Produktpreis. Zum Beispiel 44,90"
              >
                <BetragFeld v-model="variantForm.priceGross" class="w-full" placeholder="wie Produkt" />
              </UFormField>
              <MargeVorschau
                v-if="data"
                :price="variantForm.priceGross"
                :fallback-cents="data.basePriceGross"
                :vat-rate="data.vatRates[data.vatCategory]"
                :costs="[variantCosts(editingVariant)]"
                :channels="channels"
              />
            </template>
            <UFormField label="Mindestbestand" :error="fieldErrors.minimumStock">
              <UInput
                v-model.number="variantForm.minimumStock"
                type="number"
                min="0"
                class="w-full"
              />
            </UFormField>
            <div v-if="isTextile" class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Faser" :error="fieldErrors.fiber" help="Zum Beispiel 100 % Leinen">
                <UInput v-model="variantForm.fiber" class="w-full" />
              </UFormField>
              <UFormField
                label="Faser Füllung"
                :error="fieldErrors.fiberFilling"
                help="Nur bei gefüllten Teilen mit getrennter Angabe."
              >
                <UInput v-model="variantForm.fiberFilling" class="w-full" />
              </UFormField>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Herkunftsland" :error="fieldErrors.originCountry" help="Ländercode, zum Beispiel TR">
                <UInput v-model="variantForm.originCountry" maxlength="2" class="w-full font-mono uppercase" />
              </UFormField>
              <UFormField label="HS-Code" :error="fieldErrors.hsCode" help="Zolltarifnummer, zum Beispiel 6304 92 00">
                <UInput v-model="variantForm.hsCode" class="w-full font-mono" />
              </UFormField>
            </div>
            <UFormField label="Gewicht (g)" :error="fieldErrors.weightGrams" help="Versandgewicht je Stück inkl. Verpackung; für Versandkosten und Etiketten in Shopify.">
              <UInput v-model="variantForm.weightGrams" type="number" min="1" class="w-40" />
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
                {{ editingVariant ? 'Speichern' : 'Anlegen' }}
              </UButton>
            </div>
          </form>
        </template>
      </UModal>

      <UModal v-model:open="deleteProductOpen" title="Produkt löschen">
        <template #body>
          <div class="space-y-4">
            <UAlert
              v-if="deleteProductMessage"
              color="error"
              variant="subtle"
              class="rounded-[12px]"
              :description="deleteProductMessage"
            />
            <p class="text-sm">
              {{ data.name }} samt Varianten ({{ data.variants.length }}) endgültig löschen? Das lässt sich nicht
              rückgängig machen. Gelöscht wird nur, wenn keine Variante je gebucht, eingegangen oder verkauft wurde.
            </p>
            <p v-if="data.shopifyProductId" class="text-sm text-roswarning-700">
              Das Produkt ist in Shopify und bleibt dort bestehen; dort bei Bedarf selbst löschen.
            </p>
            <div class="flex justify-end gap-2 pt-2">
              <UButton color="neutral" variant="ghost" class="rounded-[8px]" @click="deleteProductOpen = false">Abbrechen</UButton>
              <UButton color="error" :loading="productBusy" class="rounded-[8px]" @click="confirmDeleteProduct">
                Endgültig löschen
              </UButton>
            </div>
          </div>
        </template>
      </UModal>

      <UModal v-model:open="deleteVariantOpen" title="Variante löschen">
        <template #body>
          <div v-if="deletingVariant" class="space-y-4">
            <UAlert
              v-if="deleteVariantMessage"
              color="error"
              variant="subtle"
              class="rounded-[12px]"
              :description="deleteVariantMessage"
            />
            <p class="text-sm">
              <span class="font-mono">{{ deletingVariant.sku }}</span> endgültig löschen? Das lässt sich nicht rückgängig
              machen. Gelöscht wird nur, wenn die Variante nie gebucht, eingegangen oder verkauft wurde; ihre
              Kanalpreise und eigenen Kostenpositionen gehen mit.
            </p>
            <div class="flex justify-end gap-2 pt-2">
              <UButton color="neutral" variant="ghost" class="rounded-[8px]" @click="deletingVariant = null">Abbrechen</UButton>
              <UButton color="error" :loading="deleteVariantBusy" class="rounded-[8px]" @click="confirmDeleteVariant">
                Endgültig löschen
              </UButton>
            </div>
          </div>
        </template>
      </UModal>

      <UModal v-model:open="shopifyOpen" title="Produkt nach Shopify übertragen">
        <template #body>
          <div class="space-y-4">
            <UAlert v-if="shopifyMessage" color="error" variant="subtle" class="rounded-[12px]" :description="shopifyMessage" />
            <p v-if="shopifyLoading && !shopifyPreview" class="text-sm text-leinen-500">Shopify wird abgefragt …</p>
            <UAlert
              v-if="shopifyDone"
              color="success"
              variant="subtle"
              class="rounded-[12px]"
              :title="`In Shopify gespeichert (${shopifyDone.variants} Varianten)`"
              description="Fotos, SEO-Texte, Kollektionen und Veröffentlichen pflegen Sie in Shopify."
            />

            <template v-if="shopifyPreview">
              <p class="text-sm text-leinen-500">
                <template v-if="shopifyPreview.isNew">Neu in Shopify, als Entwurf.</template>
                <template v-else-if="shopifyPreview.pushedAt">
                  Zuletzt übertragen {{ formatDate(shopifyPreview.pushedAt) }}<template v-if="shopifyPreview.changedSincePush">, seitdem im Dashboard geändert</template>.
                </template>
                <template v-else>In Shopify vorhanden, noch nie aus dem Dashboard übertragen.</template>
              </p>
              <UAlert
                v-if="shopifyPreview.removedVariants.length > 0"
                color="warning"
                variant="subtle"
                class="rounded-[12px]"
                title="Diese Varianten entfernt Shopify, weil das Dashboard sie nicht (mehr) führt:"
                :description="shopifyPreview.removedVariants.join(', ')"
              />
              <UAlert
                v-if="shopifyPreview.warnings.length > 0"
                color="warning"
                variant="subtle"
                class="rounded-[12px]"
                :description="shopifyPreview.warnings.join(' ')"
              />
              <p v-if="shopifyPreview.changes.length === 0" class="text-sm">Shopify stimmt mit dem Dashboard überein.</p>
              <div v-else class="max-h-80 overflow-y-auto">
                <table class="ros-tabelle w-full text-sm">
                  <thead class="text-left text-xs font-medium uppercase tracking-wide text-leinen-500">
                    <tr>
                      <th class="px-2">Feld</th>
                      <th class="px-2">Shopify</th>
                      <th class="px-2">Dashboard</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in shopifyPreview.changes" :key="c.field">
                      <td class="px-2 font-mono text-xs">{{ c.field }}</td>
                      <td class="px-2 text-leinen-500">{{ c.from ?? '–' }}</td>
                      <td class="px-2">{{ c.to ?? '–' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>

            <div class="flex justify-end gap-2 pt-2">
              <UButton color="neutral" variant="ghost" class="rounded-[8px]" @click="shopifyOpen = false">Schließen</UButton>
              <UButton
                v-if="shopifyPreview && (shopifyPreview.changes.length > 0 || shopifyPreview.removedVariants.length > 0)"
                :loading="shopifyLoading"
                class="rounded-[8px]"
                @click="pushShopify"
              >
                Übertragen
              </UButton>
            </div>
          </div>
        </template>
      </UModal>
    </div>
  </div>
</template>

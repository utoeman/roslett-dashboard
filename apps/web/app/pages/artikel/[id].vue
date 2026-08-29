<script setup lang="ts">
import type { ArtikelDetail } from '~~/shared/typen/api';

const route = useRoute();
const id = computed(() => String(route.params.id));

const { formatGeld, formatProzent, formatDatum } = useGeld();
const { leseFehler } = useApiFehler();

const { data, pending, error, refresh } = await useFetch<ArtikelDetail>(
  () => `/api/artikel/${id.value}`,
);

useHead({ title: () => data.value?.name ?? 'Artikel' });

const speichert = ref(false);
const meldung = ref<string | null>(null);
const formularFehler = ref<Record<string, string>>({});

/** Stammdaten des Artikels, direkt bearbeitbar. */
const bearbeitet = ref(false);
const form = reactive({ name: '', kategorie: '', beschreibung: '' });

watchEffect(() => {
  if (data.value) {
    form.name = data.value.name;
    form.kategorie = data.value.kategorie ?? '';
    form.beschreibung = data.value.beschreibung ?? '';
  }
});

async function stammdatenSpeichern() {
  speichert.value = true;
  meldung.value = null;
  formularFehler.value = {};
  try {
    await $fetch(`/api/artikel/${id.value}`, {
      method: 'PATCH',
      body: {
        name: form.name,
        kategorie: form.kategorie || null,
        beschreibung: form.beschreibung || null,
      },
    });
    bearbeitet.value = false;
    await refresh();
  } catch (fehler) {
    const { meldung: text, felder } = leseFehler(fehler);
    meldung.value = text;
    formularFehler.value = felder;
  } finally {
    speichert.value = false;
  }
}

/** Neue Variante anlegen. */
const variantenDialog = ref(false);
const neueVariante = reactive({
  sku: '',
  bezeichnung: '',
  basispreisNetto: '',
  mindestbestand: 0,
});

async function varianteAnlegen() {
  speichert.value = true;
  meldung.value = null;
  formularFehler.value = {};
  try {
    await $fetch(`/api/artikel/${id.value}`, {
      method: 'PATCH',
      body: {
        neueVarianten: [
          {
            sku: neueVariante.sku,
            bezeichnung: neueVariante.bezeichnung,
            basispreisNetto: neueVariante.basispreisNetto || null,
            mindestbestand: neueVariante.mindestbestand,
          },
        ],
      },
    });
    variantenDialog.value = false;
    neueVariante.sku = '';
    neueVariante.bezeichnung = '';
    neueVariante.basispreisNetto = '';
    neueVariante.mindestbestand = 0;
    await refresh();
  } catch (fehler) {
    const { meldung: text, felder } = leseFehler(fehler);
    meldung.value = text;
    // Feldpfade aus der Liste auf das Formular zurueckfuehren.
    formularFehler.value = Object.fromEntries(
      Object.entries(felder).map(([k, v]) => [k.split('.').pop() ?? k, v]),
    );
  } finally {
    speichert.value = false;
  }
}

async function varianteArchivierung(varianteId: string, archivieren: boolean) {
  try {
    await $fetch(`/api/artikel/${id.value}`, {
      method: 'PATCH',
      body: {
        geaenderteVarianten: [
          {
            id: varianteId,
            archiviertAm: archivieren ? new Date().toISOString() : null,
          },
        ],
      },
    });
    await refresh();
  } catch (fehler) {
    meldung.value = leseFehler(fehler).meldung;
  }
}

const aktiveVarianten = computed(
  () => data.value?.varianten.filter((v) => !v.archiviertAm) ?? [],
);
const archivierteVarianten = computed(
  () => data.value?.varianten.filter((v) => v.archiviertAm) ?? [],
);
</script>

<template>
  <div>
    <div v-if="error" class="p-6">
      <UAlert
        color="error"
        variant="subtle"
        class="rounded-[12px]"
        title="Artikel nicht gefunden"
        :description="'Der angeforderte Artikel existiert nicht oder wurde entfernt.'"
      />
      <UButton to="/artikel" variant="ghost" class="mt-4 rounded-[8px]" icon="i-lucide-arrow-left">
        Zurück zur Liste
      </UButton>
    </div>

    <div v-else-if="pending && !data" class="p-6 text-sm text-zinc-500">
      Artikel wird geladen …
    </div>

    <div v-else-if="data">
      <SeitenKopf :titel="data.name" :hinweis="data.kategorie ?? undefined">
        <template #aktionen>
          <UButton
            to="/artikel"
            variant="ghost"
            color="neutral"
            size="sm"
            icon="i-lucide-arrow-left"
            class="rounded-[8px]"
          >
            Alle Artikel
          </UButton>
        </template>
      </SeitenKopf>

      <div class="space-y-6 px-6 py-4">
        <UAlert
          v-if="meldung"
          color="error"
          variant="subtle"
          class="rounded-[12px]"
          :description="meldung"
        />

        <!-- Stammdaten -->
        <section
          class="rounded-[12px] border border-zinc-200/70 p-4 dark:border-zinc-800"
          style="border-width: 0.5px"
        >
          <div class="mb-3 flex items-center justify-between">
            <h2 class="text-sm font-semibold">Stammdaten</h2>
            <UButton
              v-if="!bearbeitet"
              size="xs"
              variant="ghost"
              color="neutral"
              icon="i-lucide-pencil"
              class="rounded-[8px]"
              @click="bearbeitet = true"
            >
              Bearbeiten
            </UButton>
          </div>

          <form v-if="bearbeitet" class="space-y-3" @submit.prevent="stammdatenSpeichern">
            <UFormField label="Name" required :error="formularFehler.name">
              <UInput v-model="form.name" class="w-full" />
            </UFormField>
            <UFormField label="Kategorie">
              <UInput v-model="form.kategorie" class="w-full" />
            </UFormField>
            <UFormField label="Beschreibung">
              <UTextarea v-model="form.beschreibung" :rows="3" class="w-full" />
            </UFormField>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                class="rounded-[8px]"
                @click="bearbeitet = false"
              >
                Abbrechen
              </UButton>
              <UButton type="submit" :loading="speichert" class="rounded-[8px]">
                Speichern
              </UButton>
            </div>
          </form>

          <dl v-else class="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt class="text-xs text-zinc-500">Kategorie</dt>
              <dd>{{ data.kategorie ?? '–' }}</dd>
            </div>
            <div>
              <dt class="text-xs text-zinc-500">Angelegt</dt>
              <dd>{{ formatDatum(data.erstelltAm) }}</dd>
            </div>
            <div class="sm:col-span-2">
              <dt class="text-xs text-zinc-500">Beschreibung</dt>
              <dd>{{ data.beschreibung ?? '–' }}</dd>
            </div>
          </dl>
        </section>

        <!-- Varianten -->
        <section
          class="overflow-x-auto rounded-[12px] border border-zinc-200/70 dark:border-zinc-800"
          style="border-width: 0.5px"
        >
          <div class="flex items-center justify-between px-4 py-3">
            <h2 class="text-sm font-semibold">
              Varianten
              <span class="ml-1 font-normal text-zinc-500">
                {{ aktiveVarianten.length }}
              </span>
            </h2>
            <UButton
              size="xs"
              icon="i-lucide-plus"
              class="rounded-[8px]"
              @click="variantenDialog = true"
            >
              Variante
            </UButton>
          </div>

          <table class="trd-tabelle w-full min-w-[40rem] text-sm">
            <thead
              class="border-y border-zinc-200/70 bg-zinc-50/60 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40"
            >
              <tr>
                <th class="px-4">Artikelnummer</th>
                <th class="px-4">Bezeichnung</th>
                <th class="px-4 text-right">Basispreis netto</th>
                <th class="px-4 text-right">USt</th>
                <th class="px-4 text-right">Mindestbestand</th>
                <th class="px-4 text-right">Archiv</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200/60 dark:divide-zinc-800/70">
              <tr v-for="v in aktiveVarianten" :key="v.id">
                <td class="px-4 font-mono text-xs">{{ v.sku }}</td>
                <td class="px-4">{{ v.bezeichnung }}</td>
                <td class="zahl px-4">{{ formatGeld(v.basispreisNetto) }}</td>
                <td class="zahl px-4 text-zinc-500">{{ formatProzent(v.ustSatz) }}</td>
                <td class="zahl px-4 text-zinc-500">{{ v.mindestbestand }}</td>
                <td class="px-4 text-right">
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-archive"
                    :aria-label="`${v.sku} archivieren`"
                    class="rounded-[8px]"
                    @click="varianteArchivierung(v.id, true)"
                  />
                </td>
              </tr>
              <tr v-for="v in archivierteVarianten" :key="v.id" class="text-zinc-400">
                <td class="px-4 font-mono text-xs">{{ v.sku }}</td>
                <td class="px-4">
                  {{ v.bezeichnung }}
                  <UBadge size="sm" color="neutral" variant="subtle" class="ml-2 rounded-[8px]">
                    archiviert
                  </UBadge>
                </td>
                <td class="zahl px-4">{{ formatGeld(v.basispreisNetto) }}</td>
                <td class="zahl px-4">{{ formatProzent(v.ustSatz) }}</td>
                <td class="zahl px-4">{{ v.mindestbestand }}</td>
                <td class="px-4 text-right">
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-archive-restore"
                    :aria-label="`${v.sku} zurückholen`"
                    class="rounded-[8px]"
                    @click="varianteArchivierung(v.id, false)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- Kostenpositionen -->
        <section
          class="overflow-x-auto rounded-[12px] border border-zinc-200/70 dark:border-zinc-800"
          style="border-width: 0.5px"
        >
          <div class="px-4 py-3">
            <h2 class="text-sm font-semibold">Kostenpositionen</h2>
            <p class="mt-0.5 text-xs text-zinc-500">
              Gültig für diesen Artikel: übergreifende und variantenspezifische
              Positionen. Vorsteuerabzugsfähige Positionen zählen nicht zu den
              Selbstkosten.
            </p>
          </div>

          <p
            v-if="!data.kostenpositionen.length"
            class="border-t border-zinc-200/70 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800"
          >
            Keine Kostenpositionen hinterlegt.
            <NuxtLink
              to="/einstellungen/kostenpositionen"
              class="text-trd-600 underline underline-offset-2 dark:text-trd-400"
            >
              Jetzt anlegen
            </NuxtLink>
          </p>

          <table v-else class="trd-tabelle w-full min-w-[40rem] text-sm">
            <thead
              class="border-y border-zinc-200/70 bg-zinc-50/60 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40"
            >
              <tr>
                <th class="px-4">Bezeichnung</th>
                <th class="px-4">Geltung</th>
                <th class="px-4 text-right">Wert</th>
                <th class="px-4">Vorsteuer</th>
                <th class="px-4 text-right">Verteilung</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200/60 dark:divide-zinc-800/70">
              <tr
                v-for="k in data.kostenpositionen"
                :key="k.id"
                :class="{ 'text-zinc-400': !k.aktiv }"
              >
                <td class="px-4">
                  {{ k.bezeichnung }}
                  <UBadge
                    v-if="!k.aktiv"
                    size="sm"
                    color="neutral"
                    variant="subtle"
                    class="ml-2 rounded-[8px]"
                  >
                    inaktiv
                  </UBadge>
                </td>
                <td class="px-4 text-zinc-500">
                  {{ k.varianteId ? 'Variante' : 'übergreifend' }}
                </td>
                <td class="zahl px-4">
                  {{ k.art === 'fix' ? formatGeld(k.wert) : formatProzent(k.wert) }}
                </td>
                <td class="px-4">
                  <UBadge
                    v-if="k.vorsteuerabzugsfaehig"
                    size="sm"
                    color="success"
                    variant="subtle"
                    class="rounded-[8px]"
                  >
                    abziehbar
                  </UBadge>
                  <span v-else class="text-zinc-400">–</span>
                </td>
                <td class="px-4 text-right text-zinc-500">
                  {{ k.verteilmethode === 'wert' ? 'Warenwert' : 'Stückzahl' }}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <UModal v-model:open="variantenDialog" title="Variante anlegen">
        <template #body>
          <form class="space-y-4" @submit.prevent="varianteAnlegen">
            <UFormField label="Artikelnummer" required :error="formularFehler.sku">
              <UInput v-model="neueVariante.sku" autofocus class="w-full font-mono" />
            </UFormField>
            <UFormField label="Bezeichnung" required :error="formularFehler.bezeichnung">
              <UInput v-model="neueVariante.bezeichnung" class="w-full" />
            </UFormField>
            <UFormField
              label="Basispreis netto"
              :error="formularFehler.basispreisNetto"
              help="Optional. Zum Beispiel 24,90"
            >
              <UInput v-model="neueVariante.basispreisNetto" class="w-full" />
            </UFormField>
            <UFormField label="Mindestbestand" :error="formularFehler.mindestbestand">
              <UInput
                v-model.number="neueVariante.mindestbestand"
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
                @click="variantenDialog = false"
              >
                Abbrechen
              </UButton>
              <UButton type="submit" :loading="speichert" class="rounded-[8px]">
                Anlegen
              </UButton>
            </div>
          </form>
        </template>
      </UModal>
    </div>
  </div>
</template>

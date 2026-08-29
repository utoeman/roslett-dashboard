<script setup lang="ts">
import type { Artikel, Liste } from '~~/shared/typen/api';

useHead({ title: 'Artikel' });

const { formatGeld } = useGeld();
const { leseFehler } = useApiFehler();

const suche = ref('');
const mitArchivierten = ref(false);
const seite = ref(0);
const proSeite = 100;

// Die Suche wartet einen Moment, damit nicht jeder Tastendruck eine
// Anfrage ausloest.
const sucheVerzoegert = useEntprellt(suche, 250);

const { data, pending, error, refresh } = await useFetch<Liste<Artikel>>(
  '/api/artikel',
  {
    query: {
      suche: sucheVerzoegert,
      mitArchivierten,
      limit: proSeite,
      offset: computed(() => seite.value * proSeite),
    },
  },
);

// Bei neuer Suche oder geaendertem Filter zurueck auf die erste Seite –
// sonst landet man auf einer Seite, die es im neuen Ergebnis nicht gibt.
watch([sucheVerzoegert, mitArchivierten], () => {
  seite.value = 0;
});

const seitenGesamt = computed(() =>
  data.value ? Math.max(1, Math.ceil(data.value.anzahl / proSeite)) : 1,
);

const dialogOffen = ref(false);
const speichert = ref(false);
const formularFehler = ref<Record<string, string>>({});
const meldung = ref<string | null>(null);

const neu = reactive({
  name: '',
  sku: '',
  kategorie: '',
});

async function anlegen() {
  speichert.value = true;
  formularFehler.value = {};
  meldung.value = null;
  try {
    await $fetch('/api/artikel', {
      method: 'POST',
      body: {
        name: neu.name,
        sku: neu.sku,
        kategorie: neu.kategorie || null,
      },
    });
    dialogOffen.value = false;
    neu.name = '';
    neu.sku = '';
    neu.kategorie = '';
    await refresh();
  } catch (fehler) {
    const { meldung: text, felder } = leseFehler(fehler);
    meldung.value = text;
    formularFehler.value = felder;
  } finally {
    speichert.value = false;
  }
}

/**
 * Hinweis im Seitenkopf. Weist ausdruecklich aus, wenn die Liste laenger
 * ist als das, was angezeigt wird – sonst bricht sie ab dem 101. Artikel
 * stillschweigend ab.
 */
const listenHinweis = computed(() => {
  if (!data.value) return undefined;
  const { anzahl, eintraege } = data.value;
  if (anzahl === 0) return 'Keine Artikel';
  if (eintraege.length === anzahl) return `${anzahl} Artikel`;
  const von = seite.value * proSeite + 1;
  const bis = von + eintraege.length - 1;
  return `Artikel ${von} bis ${bis} von ${anzahl}`;
});

/**
 * Klick auf eine Tabellenzeile führt zum Artikel.
 *
 * Klicks auf den Namen übernimmt der Link selbst – sonst würde zweimal
 * navigiert. Markiert der Nutzer gerade Text, wird nicht navigiert: sonst
 * ließe sich eine Artikelnummer nicht herauskopieren.
 */
function zeileOeffnen(id: string, ereignis: MouseEvent) {
  const ziel = ereignis.target as HTMLElement | null;
  if (ziel?.closest('a, button, input, label')) return;
  if ((window.getSelection()?.toString() ?? '') !== '') return;
  navigateTo(`/artikel/${id}`);
}

/** Zeigt die Preisspanne eines Artikels über alle Varianten. */
function preisspanne(artikel: Artikel): string {
  const preise = artikel.varianten
    .map((v) => v.basispreisNetto)
    .filter((p): p is number => p !== null);
  if (preise.length === 0) return '–';
  const min = Math.min(...preise);
  const max = Math.max(...preise);
  return min === max ? formatGeld(min) : `${formatGeld(min)} – ${formatGeld(max)}`;
}
</script>

<template>
  <div>
    <SeitenKopf
      titel="Artikel"
      :hinweis="listenHinweis"
    >
      <template #aktionen>
        <UButton
          icon="i-lucide-plus"
          size="sm"
          class="rounded-[8px]"
          @click="dialogOffen = true"
        >
          Artikel anlegen
        </UButton>
      </template>
    </SeitenKopf>

    <div class="px-6 py-4">
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <UInput
          v-model="suche"
          icon="i-lucide-search"
          placeholder="Name oder Artikelnummer"
          size="sm"
          class="w-64"
          :ui="{ base: 'rounded-[8px]' }"
        />
        <UCheckbox v-model="mitArchivierten" label="Archivierte anzeigen" size="sm" />
      </div>

      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        class="mb-4 rounded-[12px]"
        title="Die Artikel konnten nicht geladen werden."
        :description="error.message"
      />

      <div
        v-else-if="pending && !data"
        class="py-16 text-center text-sm text-zinc-500"
      >
        Artikel werden geladen …
      </div>

      <div
        v-else-if="!data?.eintraege.length"
        class="rounded-[12px] border border-zinc-200/70 py-16 text-center dark:border-zinc-800"
        style="border-width: 0.5px"
      >
        <p class="text-sm font-medium">
          {{ suche ? 'Kein Artikel gefunden.' : 'Noch keine Artikel angelegt.' }}
        </p>
        <p class="mt-1 text-sm text-zinc-500">
          {{
            suche
              ? 'Andere Suche versuchen oder archivierte Artikel einblenden.'
              : 'Legen Sie den ersten Artikel an, um zu beginnen.'
          }}
        </p>
        <UButton
          v-if="!suche"
          icon="i-lucide-plus"
          size="sm"
          class="mt-4 rounded-[8px]"
          @click="dialogOffen = true"
        >
          Artikel anlegen
        </UButton>
      </div>

      <div
        v-else
        class="overflow-x-auto rounded-[12px] border border-zinc-200/70 dark:border-zinc-800"
        style="border-width: 0.5px"
      >
        <table class="trd-tabelle w-full min-w-[40rem] text-sm">
          <thead
            class="border-b border-zinc-200/70 bg-zinc-50/60 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40"
          >
            <tr>
              <th class="px-4">Artikel</th>
              <th class="px-4">Kategorie</th>
              <th class="px-4">Varianten</th>
              <th class="px-4 text-right">Basispreis netto</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-200/60 dark:divide-zinc-800/70">
            <!--
              Die ganze Zeile führt zum Artikel, weil der Zeilen-Hover das
              ohnehin verspricht. Umgesetzt über einen Klick-Handler statt
              über ein absolut positioniertes Pseudo-Element: `position:
              relative` ist auf einer Tabellenzeile nicht verlässlich
              definiert, und die Klickfläche dehnte sich dadurch über die
              Tabelle hinaus. Der Name bleibt ein echter Link und damit
              tastaturbedienbar.

              Die Zeile ist zugleich `group`: der Name färbt sich, sobald
              irgendwo in der Zeile gehovert wird. Andernfalls sähe die Zeile
              anklickbar aus, ohne dass sich das Ziel des Klicks zeigt.
            -->
            <tr
              v-for="artikel in data.eintraege"
              :key="artikel.id"
              class="group cursor-pointer transition-colors hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40"
              @click="zeileOeffnen(artikel.id, $event)"
            >
              <td class="px-4">
                <NuxtLink
                  :to="`/artikel/${artikel.id}`"
                  class="font-medium transition-colors group-hover:text-trd-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-trd-500 dark:group-hover:text-trd-400"
                >
                  {{ artikel.name }}
                </NuxtLink>
                <UBadge
                  v-if="artikel.archiviertAm"
                  size="sm"
                  color="neutral"
                  variant="subtle"
                  class="ml-2 rounded-[8px]"
                >
                  archiviert
                </UBadge>
              </td>
              <td class="px-4 text-zinc-500">{{ artikel.kategorie ?? '–' }}</td>
              <td class="px-4 text-zinc-500">
                <span class="font-mono text-xs">
                  {{ artikel.varianten.map((v) => v.sku).join(', ') }}
                </span>
              </td>
              <td class="zahl px-4">{{ preisspanne(artikel) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        v-if="data && seitenGesamt > 1"
        class="mt-3 flex items-center justify-between text-sm"
      >
        <p class="text-zinc-500">Seite {{ seite + 1 }} von {{ seitenGesamt }}</p>
        <div class="flex gap-2">
          <UButton
            size="sm"
            variant="ghost"
            color="neutral"
            icon="i-lucide-chevron-left"
            class="rounded-[8px]"
            :disabled="seite === 0"
            @click="seite -= 1"
          >
            Zurück
          </UButton>
          <UButton
            size="sm"
            variant="ghost"
            color="neutral"
            trailing-icon="i-lucide-chevron-right"
            class="rounded-[8px]"
            :disabled="seite + 1 >= seitenGesamt"
            @click="seite += 1"
          >
            Weiter
          </UButton>
        </div>
      </div>
    </div>

    <UModal v-model:open="dialogOffen" title="Artikel anlegen">
      <template #body>
        <form class="space-y-4" @submit.prevent="anlegen">
          <UAlert
            v-if="meldung"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            class="rounded-[12px]"
            :description="meldung"
          />

          <UFormField
            label="Name"
            required
            :error="formularFehler.name"
            help="So heißt der Artikel in Listen und Auswertungen."
          >
            <UInput v-model="neu.name" autofocus class="w-full" />
          </UFormField>

          <UFormField
            label="Artikelnummer"
            required
            :error="formularFehler.sku"
            help="Eindeutig. Buchstaben, Ziffern, Punkt, Bindestrich, Unterstrich."
          >
            <UInput v-model="neu.sku" class="w-full font-mono" />
          </UFormField>

          <UFormField label="Kategorie" :error="formularFehler.kategorie">
            <UInput v-model="neu.kategorie" class="w-full" />
          </UFormField>

          <p
            class="rounded-[8px] bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
          >
            Der Artikel erhält automatisch eine Standardvariante. Weitere
            Varianten legen Sie anschließend in der Detailansicht an.
          </p>

          <div class="flex justify-end gap-2 pt-2">
            <UButton
              color="neutral"
              variant="ghost"
              class="rounded-[8px]"
              @click="dialogOffen = false"
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
</template>

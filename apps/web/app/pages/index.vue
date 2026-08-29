<script setup lang="ts">
useHead({ title: 'Übersicht' });

/*
 * Alle vier Zaehlwerte gemeinsam laden. Jede Liste liefert `anzahl` mit,
 * sodass hier nur die Zahl gebraucht wird und nicht der gesamte Datensatz.
 * `limit: 1` haelt die uebertragene Menge klein – gezaehlt wird in der
 * Datenbank, nicht im Browser.
 */
const { data, pending, error } = await useAsyncData(
  'uebersicht-kennzahlen',
  async () => {
    const [artikel, lieferanten, kostenpositionen, kanaele] = await Promise.all([
      $fetch<{ anzahl: number }>('/api/artikel', { query: { limit: 1 } }),
      $fetch<{ anzahl: number }>('/api/lieferanten', { query: { limit: 1 } }),
      $fetch<{ anzahl: number }>('/api/kostenpositionen', { query: { limit: 1 } }),
      $fetch<{ anzahl: number }>('/api/kanaele', { query: { limit: 1 } }),
    ]);
    return {
      artikel: artikel.anzahl,
      lieferanten: lieferanten.anzahl,
      kostenpositionen: kostenpositionen.anzahl,
      kanaele: kanaele.anzahl,
    };
  },
);

const kacheln = computed(() => [
  { name: 'Artikel', wert: data.value?.artikel ?? 0, pfad: '/artikel' },
  {
    name: 'Lieferanten',
    wert: data.value?.lieferanten ?? 0,
    pfad: '/einstellungen/lieferanten',
  },
  {
    name: 'Kostenpositionen',
    wert: data.value?.kostenpositionen ?? 0,
    pfad: '/einstellungen/kostenpositionen',
  },
  { name: 'Kanäle', wert: data.value?.kanaele ?? 0, pfad: '/einstellungen/kanaele' },
]);
</script>

<template>
  <div>
    <SeitenKopf titel="Übersicht" hinweis="Stammdaten im Überblick" />

    <div class="px-6 py-4">
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        class="mb-4 rounded-[12px]"
        title="Die Kennzahlen konnten nicht geladen werden."
        description="Läuft die Datenbank? Prüfen Sie die Verbindung und laden Sie die Seite neu."
      />

      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <NuxtLink
          v-for="kachel in kacheln"
          :key="kachel.name"
          :to="kachel.pfad"
          class="group cursor-pointer rounded-[12px] border border-zinc-200/70 px-4 py-3 transition-colors hover:border-trd-300 hover:bg-trd-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trd-500 dark:border-zinc-800 dark:hover:border-trd-800 dark:hover:bg-trd-950/20"
          style="border-width: 0.5px"
        >
          <p class="text-xs uppercase tracking-wide text-zinc-500">{{ kachel.name }}</p>
          <div class="mt-1 flex items-center justify-between">
            <p class="zahl text-2xl font-semibold tabular-nums">
              <span v-if="pending && !data" class="text-zinc-300 dark:text-zinc-700">–</span>
              <span v-else>{{ kachel.wert }}</span>
            </p>
            <!-- Der Pfeil macht sichtbar, dass die Kachel irgendwohin führt. -->
            <UIcon
              name="i-lucide-arrow-right"
              class="size-4 text-zinc-300 transition-colors group-hover:text-trd-500 dark:text-zinc-700"
              aria-hidden="true"
            />
          </div>
        </NuxtLink>
      </div>

      <div
        class="mt-6 rounded-[12px] border border-zinc-200/70 px-4 py-3 text-sm dark:border-zinc-800"
        style="border-width: 0.5px"
      >
        <p class="font-medium">Nächster Schritt</p>
        <p class="mt-0.5 text-zinc-600 dark:text-zinc-400">
          Bestandsführung und Kalkulation folgen in Phase 3: Wareneingang mit
          Chargen, Abgänge nach FIFO, Retouren, Inventur und der Kalkulator.
        </p>
      </div>
    </div>
  </div>
</template>

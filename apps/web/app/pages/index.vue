<script setup lang="ts">
useHead({ title: 'Übersicht' });

const { data: artikel } = await useFetch<{ anzahl: number }>('/api/artikel');
const { data: lieferanten } = await useFetch<{ anzahl: number }>('/api/lieferanten');
const { data: kanaele } = await useFetch<{ eintraege: unknown[] }>('/api/kanaele');
const { data: kosten } = await useFetch<{ eintraege: unknown[] }>('/api/kostenpositionen');

const kacheln = computed(() => [
  { name: 'Artikel', wert: artikel.value?.anzahl ?? 0, pfad: '/artikel' },
  { name: 'Lieferanten', wert: lieferanten.value?.anzahl ?? 0, pfad: '/einstellungen/lieferanten' },
  {
    name: 'Kostenpositionen',
    wert: kosten.value?.eintraege.length ?? 0,
    pfad: '/einstellungen/kostenpositionen',
  },
  { name: 'Kanäle', wert: kanaele.value?.eintraege.length ?? 0, pfad: '/einstellungen/kanaele' },
]);
</script>

<template>
  <div>
    <SeitenKopf titel="Übersicht" hinweis="Stammdaten im Überblick" />

    <div class="px-6 py-4">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <NuxtLink
          v-for="kachel in kacheln"
          :key="kachel.name"
          :to="kachel.pfad"
          class="rounded-[12px] border border-zinc-200/70 px-4 py-3 transition-colors hover:border-trd-300 hover:bg-trd-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trd-500 dark:border-zinc-800 dark:hover:border-trd-800 dark:hover:bg-trd-950/20"
          style="border-width: 0.5px"
        >
          <p class="text-xs uppercase tracking-wide text-zinc-500">{{ kachel.name }}</p>
          <p class="zahl mt-1 text-2xl font-semibold tabular-nums">{{ kachel.wert }}</p>
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

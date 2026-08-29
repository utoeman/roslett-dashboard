<script setup lang="ts">
/**
 * Navigation fuer schmale Bildschirme.
 *
 * Auf dem Telefon ist links kein Platz fuer die feste Leiste. Statt sie
 * ersatzlos auszublenden – dann kaeme man von einer Unterseite nicht mehr
 * weiter – klappt hier eine Liste auf.
 */
const offen = ref(false);
const route = useRoute();

const punkte = [
  { name: 'Übersicht', pfad: '/' },
  { name: 'Artikel', pfad: '/artikel' },
  { name: 'Lieferanten', pfad: '/einstellungen/lieferanten' },
  { name: 'Kostenpositionen', pfad: '/einstellungen/kostenpositionen' },
  { name: 'Kanäle', pfad: '/einstellungen/kanaele' },
];

// Beim Seitenwechsel schliessen, sonst bleibt die Liste ueber dem Inhalt stehen.
watch(() => route.path, () => { offen.value = false; });
</script>

<template>
  <div
    class="border-b border-zinc-200/70 px-4 py-2 md:hidden dark:border-zinc-800"
    style="border-bottom-width: 0.5px"
  >
    <div class="flex items-center justify-between">
      <NuxtLink to="/" class="flex items-center gap-2">
        <span class="size-2.5 rounded-full bg-trd-500" aria-hidden="true" />
        <span class="text-sm font-semibold">The Refined Decor</span>
      </NuxtLink>
      <UButton
        size="sm"
        variant="ghost"
        color="neutral"
        :icon="offen ? 'i-lucide-x' : 'i-lucide-menu'"
        :aria-label="offen ? 'Navigation schließen' : 'Navigation öffnen'"
        :aria-expanded="offen"
        class="rounded-[8px]"
        @click="offen = !offen"
      />
    </div>

    <nav v-if="offen" class="mt-2 space-y-0.5 pb-2" aria-label="Hauptnavigation">
      <NuxtLink
        v-for="punkt in punkte"
        :key="punkt.pfad"
        :to="punkt.pfad"
        class="block rounded-[8px] px-2 py-2 text-sm"
        :class="
          route.path === punkt.pfad
            ? 'bg-trd-50 font-medium text-trd-700 dark:bg-trd-950/50 dark:text-trd-300'
            : 'text-zinc-600 dark:text-zinc-400'
        "
      >
        {{ punkt.name }}
      </NuxtLink>
    </nav>
  </div>
</template>

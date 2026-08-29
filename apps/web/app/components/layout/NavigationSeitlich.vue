<script setup lang="ts">
/**
 * Seitennavigation.
 *
 * Die Reihenfolge folgt dem Arbeitsablauf: erst der Ueberblick, dann die
 * Stammdaten, zuletzt die Einstellungen. Punkte fuer spaetere Phasen sind
 * bereits sichtbar, aber als "folgt" gekennzeichnet – so ist erkennbar,
 * wohin das Werkzeug waechst, ohne dass ein Klick ins Leere fuehrt.
 */
const route = useRoute();

/** Ein Punkt, der noch nicht gebaut ist, traegt `folgt` und wird nicht verlinkt. */
interface Navigationspunkt {
  name: string;
  pfad: string;
  symbol: string;
  folgt?: boolean;
}

interface Navigationsbereich {
  titel: string | null;
  punkte: Navigationspunkt[];
}

const bereiche: Navigationsbereich[] = [
  {
    titel: null,
    punkte: [{ name: 'Übersicht', pfad: '/', symbol: 'i-lucide-layout-dashboard' }],
  },
  {
    titel: 'Stammdaten',
    punkte: [
      { name: 'Artikel', pfad: '/artikel', symbol: 'i-lucide-package' },
      { name: 'Lieferanten', pfad: '/einstellungen/lieferanten', symbol: 'i-lucide-truck' },
      { name: 'Kostenpositionen', pfad: '/einstellungen/kostenpositionen', symbol: 'i-lucide-receipt' },
      { name: 'Kanäle', pfad: '/einstellungen/kanaele', symbol: 'i-lucide-store' },
    ],
  },
  {
    titel: 'Bestand',
    punkte: [
      { name: 'Wareneingang', pfad: '/wareneingang', symbol: 'i-lucide-package-plus', folgt: true },
      { name: 'Buchungen', pfad: '/buchungen', symbol: 'i-lucide-arrow-left-right', folgt: true },
      { name: 'Inventur', pfad: '/inventur', symbol: 'i-lucide-clipboard-check', folgt: true },
    ],
  },
];

function istAktiv(pfad: string): boolean {
  if (pfad === '/') return route.path === '/';
  return route.path === pfad || route.path.startsWith(`${pfad}/`);
}
</script>

<template>
  <nav
    class="hidden w-56 shrink-0 flex-col border-r border-zinc-200/70 bg-zinc-50/60 px-3 py-4 md:flex dark:border-zinc-800 dark:bg-zinc-900/40"
    aria-label="Hauptnavigation"
  >
    <NuxtLink
      to="/"
      class="mb-6 flex items-center gap-2 px-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trd-500"
    >
      <span class="size-2.5 rounded-full bg-trd-500" aria-hidden="true" />
      <span class="text-sm font-semibold tracking-tight">The Refined Decor</span>
    </NuxtLink>

    <div v-for="(bereich, i) in bereiche" :key="i" class="mb-5">
      <p
        v-if="bereich.titel"
        class="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500"
      >
        {{ bereich.titel }}
      </p>
      <ul class="space-y-0.5">
        <li v-for="punkt in bereich.punkte" :key="punkt.pfad">
          <span
            v-if="punkt.folgt"
            class="flex cursor-default items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-sm text-zinc-400 dark:text-zinc-600"
            :title="`${punkt.name} folgt in Phase 3`"
          >
            <UIcon :name="punkt.symbol" class="size-4 shrink-0" />
            {{ punkt.name }}
            <span class="ml-auto text-[10px] uppercase tracking-wide">folgt</span>
          </span>
          <NuxtLink
            v-else
            :to="punkt.pfad"
            class="flex items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-trd-500"
            :class="
              istAktiv(punkt.pfad)
                ? 'bg-trd-50 font-medium text-trd-700 dark:bg-trd-950/50 dark:text-trd-300'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/60'
            "
          >
            <UIcon :name="punkt.symbol" class="size-4 shrink-0" />
            {{ punkt.name }}
          </NuxtLink>
        </li>
      </ul>
    </div>
  </nav>
</template>

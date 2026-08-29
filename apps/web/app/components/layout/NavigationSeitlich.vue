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

/** Ein Punkt, der noch nicht gebaut ist, traegt `pending` und wird nicht verlinkt. */
interface NavLink {
  name: string;
  path: string;
  icon: string;
  pending?: boolean;
}

interface NavSection {
  title: string | null;
  links: NavLink[];
}

const sections: NavSection[] = [
  {
    title: null,
    links: [{ name: 'Übersicht', path: '/', icon: 'i-lucide-layout-dashboard' }],
  },
  {
    title: 'Stammdaten',
    links: [
      { name: 'Artikel', path: '/artikel', icon: 'i-lucide-package' },
      { name: 'Lieferanten', path: '/einstellungen/lieferanten', icon: 'i-lucide-truck' },
      { name: 'Kostenpositionen', path: '/einstellungen/kostenpositionen', icon: 'i-lucide-receipt' },
      { name: 'Kanäle', path: '/einstellungen/kanaele', icon: 'i-lucide-store' },
    ],
  },
  {
    title: 'Bestand',
    links: [
      { name: 'Wareneingang', path: '/wareneingang', icon: 'i-lucide-package-plus', pending: true },
      { name: 'Buchungen', path: '/buchungen', icon: 'i-lucide-arrow-left-right', pending: true },
      { name: 'Inventur', path: '/inventur', icon: 'i-lucide-clipboard-check', pending: true },
    ],
  },
];

function isActive(path: string): boolean {
  if (path === '/') return route.path === '/';
  return route.path === path || route.path.startsWith(`${path}/`);
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

    <div v-for="(section, i) in sections" :key="i" class="mb-5">
      <p
        v-if="section.title"
        class="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500"
      >
        {{ section.title }}
      </p>
      <ul class="space-y-0.5">
        <li v-for="link in section.links" :key="link.path">
          <span
            v-if="link.pending"
            class="flex cursor-default items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-sm text-zinc-400 dark:text-zinc-600"
            :title="`${link.name} folgt in Phase 3`"
          >
            <UIcon :name="link.icon" class="size-4 shrink-0" />
            {{ link.name }}
            <span class="ml-auto text-[10px] uppercase tracking-wide">folgt</span>
          </span>
          <NuxtLink
            v-else
            :to="link.path"
            class="flex items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-trd-500"
            :class="
              isActive(link.path)
                ? 'bg-trd-50 font-medium text-trd-700 dark:bg-trd-950/50 dark:text-trd-300'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/60'
            "
          >
            <UIcon :name="link.icon" class="size-4 shrink-0" />
            {{ link.name }}
          </NuxtLink>
        </li>
      </ul>
    </div>
  </nav>
</template>

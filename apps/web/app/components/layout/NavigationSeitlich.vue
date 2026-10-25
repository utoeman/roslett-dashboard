<script setup lang="ts">
/**
 * Sidebar in workflow order (docs/screens.md). Upcoming sections are shown as
 * "folgt" without a link.
 */
const route = useRoute();

/** `pending` entries are not linked yet. */
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
    links: [
      { name: 'Übersicht', path: '/', icon: 'i-lucide-layout-dashboard' },
      { name: 'Produkte', path: '/produkte', icon: 'i-lucide-package' },
      { name: 'Wareneingang', path: '/wareneingang', icon: 'i-lucide-package-plus' },
      { name: 'Verkäufe', path: '/verkaeufe', icon: 'i-lucide-shopping-bag', pending: true },
      { name: 'Bestandsjournal', path: '/journal', icon: 'i-lucide-arrow-left-right' },
    ],
  },
  {
    title: 'Einstellungen',
    links: [
      { name: 'Kanäle', path: '/einstellungen/kanaele', icon: 'i-lucide-store' },
      { name: 'Lieferanten', path: '/einstellungen/lieferanten', icon: 'i-lucide-truck' },
      { name: 'Kostenpositionen', path: '/einstellungen/kostenpositionen', icon: 'i-lucide-receipt' },
      { name: 'Kategorien', path: '/einstellungen/kategorien', icon: 'i-lucide-tags' },
      { name: 'Farben', path: '/einstellungen/farben', icon: 'i-lucide-palette' },
      { name: 'MwSt-Sätze', path: '/einstellungen/mwst', icon: 'i-lucide-percent' },
      { name: 'Hersteller', path: '/einstellungen/hersteller', icon: 'i-lucide-factory' },
    ],
  },
];

const { logout } = useLogout();

function isActive(path: string): boolean {
  if (path === '/') return route.path === '/';
  return route.path === path || route.path.startsWith(`${path}/`);
}
</script>

<template>
  <nav
    class="hidden w-56 shrink-0 flex-col border-r border-leinen-200/70 bg-leinen-50 px-3 py-4 md:flex dark:border-leinen-800 dark:bg-leinen-900/40"
    aria-label="Hauptnavigation"
  >
    <NuxtLink
      to="/"
      class="mb-6 flex items-center gap-2 px-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ros-500"
    >
      <span class="size-2.5 rounded-full bg-ros-500" aria-hidden="true" />
      <span class="text-sm font-semibold tracking-tight">Roslett</span>
    </NuxtLink>

    <div v-for="(section, i) in sections" :key="i" class="mb-5">
      <p
        v-if="section.title"
        class="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-leinen-400 dark:text-leinen-500"
      >
        {{ section.title }}
      </p>
      <ul class="space-y-0.5">
        <li v-for="link in section.links" :key="link.path">
          <span
            v-if="link.pending"
            class="flex cursor-default items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-sm text-leinen-400 dark:text-leinen-600"
            :title="`${link.name} folgt`"
          >
            <UIcon :name="link.icon" class="size-4 shrink-0" />
            {{ link.name }}
            <span class="ml-auto text-[10px] uppercase tracking-wide">folgt</span>
          </span>
          <NuxtLink
            v-else
            :to="link.path"
            class="flex items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ros-500"
            :class="
              isActive(link.path)
                ? 'bg-ros-50 font-medium text-ros-700 dark:bg-ros-950/50 dark:text-ros-300'
                : 'text-leinen-600 hover:bg-leinen-100 dark:text-leinen-400 dark:hover:bg-leinen-800/60'
            "
          >
            <UIcon :name="link.icon" class="size-4 shrink-0" />
            {{ link.name }}
          </NuxtLink>
        </li>
      </ul>
    </div>

    <button
      type="button"
      class="mt-auto flex items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-sm text-leinen-500 transition-colors hover:bg-leinen-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ros-500"
      @click="logout"
    >
      <UIcon name="i-lucide-log-out" class="size-4 shrink-0" />
      Abmelden
    </button>
  </nav>
</template>

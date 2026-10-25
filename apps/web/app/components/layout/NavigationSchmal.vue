<script setup lang="ts">
/** Collapsible navigation for narrow screens, where the sidebar does not fit. */
const open = ref(false);
const route = useRoute();
const { logout } = useLogout();

const links = [
  { name: 'Übersicht', path: '/' },
  { name: 'Produkte', path: '/produkte' },
  { name: 'Wareneingang', path: '/wareneingang' },
  { name: 'Bestandsjournal', path: '/journal' },
  { name: 'Kanäle', path: '/einstellungen/kanaele' },
  { name: 'Lieferanten', path: '/einstellungen/lieferanten' },
  { name: 'Kostenpositionen', path: '/einstellungen/kostenpositionen' },
  { name: 'Kategorien', path: '/einstellungen/kategorien' },
  { name: 'Farben', path: '/einstellungen/farben' },
  { name: 'MwSt-Sätze', path: '/einstellungen/mwst' },
  { name: 'Hersteller', path: '/einstellungen/hersteller' },
];

// Close on navigation so the list does not cover the content.
watch(() => route.path, () => { open.value = false; });
</script>

<template>
  <div
    class="border-b border-leinen-200/70 px-4 py-2 md:hidden dark:border-leinen-800"
    style="border-bottom-width: 0.5px"
  >
    <div class="flex items-center justify-between">
      <NuxtLink to="/" class="flex items-center gap-2">
        <span class="size-2.5 rounded-full bg-ros-500" aria-hidden="true" />
        <span class="text-sm font-semibold">Roslett</span>
      </NuxtLink>
      <UButton
        size="sm"
        variant="ghost"
        color="neutral"
        :icon="open ? 'i-lucide-x' : 'i-lucide-menu'"
        :aria-label="open ? 'Navigation schließen' : 'Navigation öffnen'"
        :aria-expanded="open"
        class="rounded-[8px]"
        @click="open = !open"
      />
    </div>

    <nav v-if="open" class="mt-2 space-y-0.5 pb-2" aria-label="Hauptnavigation">
      <NuxtLink
        v-for="link in links"
        :key="link.path"
        :to="link.path"
        class="block rounded-[8px] px-2 py-2 text-sm"
        :class="
          route.path === link.path
            ? 'bg-ros-50 font-medium text-ros-700 dark:bg-ros-950/50 dark:text-ros-300'
            : 'text-leinen-600 dark:text-leinen-400'
        "
      >
        {{ link.name }}
      </NuxtLink>
      <button
        type="button"
        class="block w-full rounded-[8px] px-2 py-2 text-left text-sm text-leinen-500"
        @click="logout"
      >
        Abmelden
      </button>
    </nav>
  </div>
</template>

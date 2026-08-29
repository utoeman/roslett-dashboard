<script setup lang="ts">
/**
 * Grundgeruest: feste Seitennavigation links, Inhalt rechts.
 *
 * Ein internes Werkzeug wird taeglich benutzt und immer an denselben Stellen
 * bedient. Die Navigation bleibt deshalb sichtbar stehen, statt hinter einem
 * Menue zu verschwinden – ein Klick weniger bei jedem Wechsel.
 */
</script>

<template>
  <div class="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
    <div class="flex min-h-screen">
      <NavigationSeitlich />
      <div class="min-w-0 flex-1">
        <NavigationSchmal />
        <slot />
      </div>
    </div>
  </div>
</template>

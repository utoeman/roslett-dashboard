<script setup lang="ts">
defineProps<{
  titel: string;
  /** Kurze Einordnung unter dem Titel. Optional. */
  hinweis?: string;
}>();
</script>

<template>
  <header
    class="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-200/70 px-6 py-4 dark:border-zinc-800"
  >
    <div class="min-w-0">
      <h1 class="text-lg font-semibold tracking-tight">{{ titel }}</h1>
      <p v-if="hinweis" class="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
        {{ hinweis }}
      </p>
    </div>
    <div class="flex items-center gap-2">
      <slot name="aktionen" />
    </div>
  </header>
</template>

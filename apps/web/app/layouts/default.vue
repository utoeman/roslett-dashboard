<script setup lang="ts">
/** Fixed sidebar on the left, content on the right. */
</script>

<template>
  <div class="min-h-screen bg-leinen-100 text-leinen-900 dark:bg-leinen-950 dark:text-leinen-100">
    <div class="flex min-h-screen">
      <NavigationSeitlich />
      <div class="min-w-0 flex-1">
        <NavigationSchmal />
        <slot />
      </div>
    </div>
  </div>
</template>

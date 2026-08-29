<script setup lang="ts">
useHead({
  titleTemplate: (titel) => (titel ? `${titel} · TRD` : 'TRD-Dashboard'),
  htmlAttrs: { lang: 'de' },
});
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<script setup lang="ts">
useHead({
  titleTemplate: (titel) => (titel ? `${titel} · Roslett` : 'Roslett-Dashboard'),
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

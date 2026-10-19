<script setup lang="ts">
import { CURRENCIES } from '~~/shared/currencies';

/** Currency picker; searchable by code and name, so no free-text typos. */
const model = defineModel<string | undefined>();

const items = CURRENCIES.map((c) => ({ label: `${c.code} · ${c.name}`, value: c.code as string }));
</script>

<template>
  <USelectMenu v-model="model" :items="items" value-key="value" placeholder="Währung wählen" class="w-full" />
</template>

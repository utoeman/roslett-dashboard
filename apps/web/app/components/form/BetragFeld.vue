<script setup lang="ts">
/** Price input in German notation; tidied to "1.234,50" when the field is left. Attributes pass through to UInput. */
const model = defineModel<string>({ default: '' });
const { tidyInput } = useMoney();
</script>

<template>
  <UInput v-model="model" inputmode="decimal" placeholder="0,00" @blur="model = tidyInput(model)" />
</template>

<script setup lang="ts">
import type { ShopifyStockLine } from '~~/shared/types/api';

// Warnings shared by every stock push to Shopify (G33).
const props = defineProps<{ unlinked: string[]; lines?: ShopifyStockLine[] }>();

const overshooting = computed(() => (props.lines ?? []).filter((l) => l.overshoots));
</script>

<template>
  <UAlert
    v-if="unlinked.length > 0"
    color="warning"
    variant="subtle"
    class="rounded-[12px]"
    :title="`Nicht mit Shopify verknüpft, wird übersprungen: ${unlinked.join(', ')}`"
    description="Bitte das Produkt erst nach Shopify übertragen oder verknüpfen; die Buchungen bleiben offen."
  />
  <UAlert
    v-if="overshooting.length > 0"
    color="warning"
    variant="subtle"
    class="rounded-[12px]"
    :title="`Shopify hätte danach mehr als das Dashboard: ${overshooting.map((l) => `${l.sku} (${(l.shopifyStock ?? 0) + l.delta} statt ${l.dashboardStock})`).join(', ')}`"
    description="Shopify führt diesen Bestand vermutlich schon, etwa von Hand eingetragen. Vor dem Übertragen in Shopify prüfen, sonst zählt er doppelt."
  />
</template>

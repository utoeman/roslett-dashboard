<script setup lang="ts">
useHead({ title: 'Lieferanten' });

interface Lieferant {
  id: string;
  name: string;
  land: string | null;
  notiz: string | null;
  archiviertAm: string | null;
}

const { formatDatum } = useGeld();
const { leseFehler } = useApiFehler();

const mitArchivierten = ref(false);
const { data, pending, refresh } = await useFetch<{
  eintraege: Lieferant[];
  anzahl: number;
}>('/api/lieferanten', { query: { mitArchivierten } });

const dialogOffen = ref(false);
const speichert = ref(false);
const meldung = ref<string | null>(null);
const formularFehler = ref<Record<string, string>>({});
const neu = reactive({ name: '', land: '', notiz: '' });

async function anlegen() {
  speichert.value = true;
  meldung.value = null;
  formularFehler.value = {};
  try {
    await $fetch('/api/lieferanten', {
      method: 'POST',
      body: { name: neu.name, land: neu.land || null, notiz: neu.notiz || null },
    });
    dialogOffen.value = false;
    neu.name = '';
    neu.land = '';
    neu.notiz = '';
    await refresh();
  } catch (fehler) {
    const { meldung: text, felder } = leseFehler(fehler);
    meldung.value = text;
    formularFehler.value = felder;
  } finally {
    speichert.value = false;
  }
}

async function archivierung(id: string, archivieren: boolean) {
  try {
    await $fetch(`/api/lieferanten/${id}`, {
      method: 'PATCH',
      body: { archiviertAm: archivieren ? new Date().toISOString() : null },
    });
    await refresh();
  } catch (fehler) {
    meldung.value = leseFehler(fehler).meldung;
  }
}
</script>

<template>
  <div>
    <SeitenKopf
      titel="Lieferanten"
      hinweis="Herkunft der Chargen. Archivierte Lieferanten bleiben in bestehenden Chargen erhalten."
    >
      <template #aktionen>
        <UButton icon="i-lucide-plus" size="sm" class="rounded-[8px]" @click="dialogOffen = true">
          Lieferant anlegen
        </UButton>
      </template>
    </SeitenKopf>

    <div class="px-6 py-4">
      <UAlert
        v-if="meldung"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        class="mb-4 rounded-[12px]"
        :description="meldung"
      />

      <UCheckbox v-model="mitArchivierten" label="Archivierte anzeigen" size="sm" class="mb-4" />

      <div v-if="pending && !data" class="py-12 text-center text-sm text-zinc-500">
        Wird geladen …
      </div>

      <div
        v-else-if="!data?.eintraege.length"
        class="rounded-[12px] border border-zinc-200/70 py-16 text-center dark:border-zinc-800"
        style="border-width: 0.5px"
      >
        <p class="text-sm font-medium">Noch keine Lieferanten angelegt.</p>
        <p class="mt-1 text-sm text-zinc-500">
          Lieferanten werden beim Wareneingang einer Charge zugeordnet.
        </p>
      </div>

      <div
        v-else
        class="overflow-hidden rounded-[12px] border border-zinc-200/70 dark:border-zinc-800"
        style="border-width: 0.5px"
      >
        <div class="overflow-x-auto">
          <table class="trd-tabelle w-full min-w-[40rem] text-sm">
          <thead
            class="border-b border-zinc-200/70 bg-zinc-50/60 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40"
          >
            <tr>
              <th class="px-4">Name</th>
              <th class="px-4">Land</th>
              <th class="px-4">Notiz</th>
              <th class="w-10 px-4"><span class="sr-only">Aktionen</span></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-200/60 dark:divide-zinc-800/70">
            <tr
              v-for="l in data.eintraege"
              :key="l.id"
              :class="{ 'text-zinc-400': l.archiviertAm }"
            >
              <td class="px-4 font-medium">
                {{ l.name }}
                <UBadge
                  v-if="l.archiviertAm"
                  size="sm"
                  color="neutral"
                  variant="subtle"
                  class="ml-2 rounded-[8px]"
                >
                  archiviert
                </UBadge>
              </td>
              <td class="px-4 text-zinc-500">{{ l.land ?? '–' }}</td>
              <td class="max-w-md truncate px-4 text-zinc-500">{{ l.notiz ?? '–' }}</td>
              <td class="px-4 text-right">
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  :icon="l.archiviertAm ? 'i-lucide-archive-restore' : 'i-lucide-archive'"
                  :aria-label="l.archiviertAm ? `${l.name} zurückholen` : `${l.name} archivieren`"
                  class="rounded-[8px]"
                  @click="archivierung(l.id, !l.archiviertAm)"
                />
              </td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>
    </div>

    <UModal v-model:open="dialogOffen" title="Lieferant anlegen">
      <template #body>
        <form class="space-y-4" @submit.prevent="anlegen">
          <UFormField label="Name" required :error="formularFehler.name">
            <UInput v-model="neu.name" autofocus class="w-full" />
          </UFormField>
          <UFormField label="Land" :error="formularFehler.land" help="Zweistelliger Ländercode, etwa DE oder IT.">
            <UInput v-model="neu.land" maxlength="2" class="w-full uppercase" />
          </UFormField>
          <UFormField label="Notiz" :error="formularFehler.notiz">
            <UTextarea v-model="neu.notiz" :rows="2" class="w-full" />
          </UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <UButton color="neutral" variant="ghost" class="rounded-[8px]" @click="dialogOffen = false">
              Abbrechen
            </UButton>
            <UButton type="submit" :loading="speichert" class="rounded-[8px]">Anlegen</UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { Liste, Lieferant } from '~~/shared/typen/api';

useHead({ title: 'Lieferanten' });

const { leseFehler } = useApiFehler();

const mitArchivierten = ref(false);
const { data, pending, refresh } = await useFetch<Liste<Lieferant>>(
  '/api/lieferanten',
  { query: { mitArchivierten } },
);

const dialogOffen = ref(false);
const speichert = ref(false);
const meldung = ref<string | null>(null);
const formularFehler = ref<Record<string, string>>({});

/**
 * Derselbe Dialog legt an und bearbeitet. Ist `bearbeiteId` gesetzt, wird
 * gespeichert statt angelegt – so gibt es nur ein Formular zu pflegen und
 * beide Wege koennen nicht auseinanderlaufen.
 */
const bearbeiteId = ref<string | null>(null);
const form = reactive({ name: '', land: '', notiz: '' });

function dialogOeffnen(lieferant?: Lieferant) {
  meldung.value = null;
  formularFehler.value = {};
  bearbeiteId.value = lieferant?.id ?? null;
  form.name = lieferant?.name ?? '';
  form.land = lieferant?.land ?? '';
  form.notiz = lieferant?.notiz ?? '';
  dialogOffen.value = true;
}

async function speichern() {
  speichert.value = true;
  meldung.value = null;
  formularFehler.value = {};
  const rumpf = {
    name: form.name,
    land: form.land || null,
    notiz: form.notiz || null,
  };
  try {
    if (bearbeiteId.value) {
      await $fetch(`/api/lieferanten/${bearbeiteId.value}`, {
        method: 'PATCH',
        body: rumpf,
      });
    } else {
      await $fetch('/api/lieferanten', { method: 'POST', body: rumpf });
    }
    dialogOffen.value = false;
    await refresh();
  } catch (fehler) {
    const { meldung: text, felder } = leseFehler(fehler);
    meldung.value = text;
    formularFehler.value = felder;
  } finally {
    speichert.value = false;
  }
}

async function archivierung(lieferant: Lieferant) {
  try {
    await $fetch(`/api/lieferanten/${lieferant.id}`, {
      method: 'PATCH',
      body: { archiviertAm: lieferant.archiviertAm ? null : new Date().toISOString() },
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
        <UButton icon="i-lucide-plus" size="sm" class="rounded-[8px]" @click="dialogOeffnen()">
          Lieferant anlegen
        </UButton>
      </template>
    </SeitenKopf>

    <div class="px-6 py-4">
      <UAlert
        v-if="meldung && !dialogOffen"
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
        class="overflow-x-auto rounded-[12px] border border-zinc-200/70 dark:border-zinc-800"
        style="border-width: 0.5px"
      >
        <table class="trd-tabelle w-full min-w-[40rem] text-sm">
          <thead
            class="border-b border-zinc-200/70 bg-zinc-50/60 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40"
          >
            <tr>
              <th class="px-4">Name</th>
              <th class="px-4">Land</th>
              <th class="px-4">Notiz</th>
              <th class="px-4 text-right">Aktionen</th>
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
              <td class="px-4">
                <div class="flex justify-end gap-1">
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-pencil"
                    :aria-label="`${l.name} bearbeiten`"
                    class="rounded-[8px]"
                    @click="dialogOeffnen(l)"
                  >
                    Bearbeiten
                  </UButton>
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    :icon="l.archiviertAm ? 'i-lucide-archive-restore' : 'i-lucide-archive'"
                    :aria-label="l.archiviertAm ? `${l.name} zurückholen` : `${l.name} archivieren`"
                    class="rounded-[8px]"
                    @click="archivierung(l)"
                  >
                    {{ l.archiviertAm ? 'Zurückholen' : 'Archivieren' }}
                  </UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal
      v-model:open="dialogOffen"
      :title="bearbeiteId ? 'Lieferant bearbeiten' : 'Lieferant anlegen'"
    >
      <template #body>
        <form class="space-y-4" @submit.prevent="speichern">
          <UAlert
            v-if="meldung"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            class="rounded-[12px]"
            :description="meldung"
          />
          <UFormField label="Name" required :error="formularFehler.name">
            <UInput v-model="form.name" autofocus class="w-full" />
          </UFormField>
          <UFormField
            label="Land"
            :error="formularFehler.land"
            help="Zweistelliger Ländercode, etwa DE oder IT."
          >
            <UInput v-model="form.land" maxlength="2" class="w-full uppercase" />
          </UFormField>
          <UFormField label="Notiz" :error="formularFehler.notiz">
            <UTextarea v-model="form.notiz" :rows="2" class="w-full" />
          </UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              color="neutral"
              variant="ghost"
              class="rounded-[8px]"
              @click="dialogOffen = false"
            >
              Abbrechen
            </UButton>
            <UButton type="submit" :loading="speichert" class="rounded-[8px]">
              {{ bearbeiteId ? 'Speichern' : 'Anlegen' }}
            </UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>

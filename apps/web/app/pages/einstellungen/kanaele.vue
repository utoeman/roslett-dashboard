<script setup lang="ts">
useHead({ title: 'Kanäle' });

interface Kanal {
  id: string;
  name: string;
  gebuehrProzent: number | null;
  gebuehrFix: number | null;
  preisregel: 'gleiche_marge' | 'fest';
  aktiv: boolean;
}

const { formatGeld, formatProzent } = useGeld();
const { leseFehler } = useApiFehler();

const { data, pending, refresh } = await useFetch<{ eintraege: Kanal[] }>('/api/kanaele');

const dialogOffen = ref(false);
const speichert = ref(false);
const meldung = ref<string | null>(null);
const formularFehler = ref<Record<string, string>>({});

const neu = reactive({
  name: '',
  gebuehrProzent: '',
  gebuehrFix: '',
  preisregel: 'gleiche_marge' as 'gleiche_marge' | 'fest',
});

const regelOptionen = [
  { label: 'Preis aus Zielmarge zurückrechnen', value: 'gleiche_marge' },
  { label: 'Preis fest vorgeben', value: 'fest' },
];

async function anlegen() {
  speichert.value = true;
  meldung.value = null;
  formularFehler.value = {};
  try {
    await $fetch('/api/kanaele', {
      method: 'POST',
      body: {
        name: neu.name,
        gebuehrProzent: neu.gebuehrProzent || 0,
        gebuehrFix: neu.gebuehrFix || 0,
        preisregel: neu.preisregel,
      },
    });
    dialogOffen.value = false;
    neu.name = '';
    neu.gebuehrProzent = '';
    neu.gebuehrFix = '';
    await refresh();
  } catch (fehler) {
    const { meldung: text, felder } = leseFehler(fehler);
    meldung.value = text;
    formularFehler.value = felder;
  } finally {
    speichert.value = false;
  }
}

async function umschalten(k: Kanal) {
  try {
    await $fetch(`/api/kanaele/${k.id}`, {
      method: 'PATCH',
      body: { aktiv: !k.aktiv },
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
      titel="Kanäle"
      hinweis="Verkaufswege mit ihren Gebühren. Grundlage für die Preisrückrechnung."
    >
      <template #aktionen>
        <UButton icon="i-lucide-plus" size="sm" class="rounded-[8px]" @click="dialogOffen = true">
          Kanal anlegen
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

      <div v-if="pending && !data" class="py-12 text-center text-sm text-zinc-500">
        Wird geladen …
      </div>

      <div
        v-else-if="!data?.eintraege.length"
        class="rounded-[12px] border border-zinc-200/70 py-16 text-center dark:border-zinc-800"
        style="border-width: 0.5px"
      >
        <p class="text-sm font-medium">Noch keine Kanäle angelegt.</p>
        <p class="mt-1 text-sm text-zinc-500">
          Ein Kanal beschreibt, wo verkauft wird und welche Gebühren dabei anfallen.
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
              <th class="px-4">Kanal</th>
              <th class="px-4 text-right">Gebühr prozentual</th>
              <th class="px-4 text-right">Gebühr fix</th>
              <th class="px-4">Preisregel</th>
              <th class="px-4">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-200/60 dark:divide-zinc-800/70">
            <tr v-for="k in data.eintraege" :key="k.id" :class="{ 'text-zinc-400': !k.aktiv }">
              <td class="px-4 font-medium">
                {{ k.name }}
              </td>
              <td class="zahl px-4">{{ formatProzent(k.gebuehrProzent) }}</td>
              <td class="zahl px-4">{{ formatGeld(k.gebuehrFix) }}</td>
              <td class="px-4 text-zinc-500">
                {{ k.preisregel === 'gleiche_marge' ? 'aus Zielmarge' : 'fest' }}
              </td>
              <td class="px-4">
                <UButton
                  size="xs"
                  variant="ghost"
                  :color="k.aktiv ? 'success' : 'neutral'"
                  :icon="k.aktiv ? 'i-lucide-check' : 'i-lucide-minus'"
                  class="rounded-[8px]"
                  :title="
                    k.aktiv
                      ? 'Steht zur Preisberechnung zur Verfügung. Klicken zum Deaktivieren.'
                      : 'Steht nicht zur Verfügung. Klicken zum Aktivieren.'
                  "
                  @click="umschalten(k)"
                >
                  {{ k.aktiv ? 'aktiv' : 'inaktiv' }}
                </UButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal v-model:open="dialogOffen" title="Kanal anlegen">
      <template #body>
        <form class="space-y-4" @submit.prevent="anlegen">
          <UFormField label="Name" required :error="formularFehler.name">
            <UInput v-model="neu.name" autofocus class="w-full" />
          </UFormField>
          <UFormField
            label="Gebühr prozentual"
            :error="formularFehler.gebuehrProzent"
            help="Anteil vom Verkaufspreis. Zum Beispiel 6,5"
          >
            <UInput v-model="neu.gebuehrProzent" class="w-full" placeholder="0" />
          </UFormField>
          <UFormField
            label="Gebühr fix"
            :error="formularFehler.gebuehrFix"
            help="Betrag je Verkauf. Zum Beispiel 0,20"
          >
            <UInput v-model="neu.gebuehrFix" class="w-full" placeholder="0,00" />
          </UFormField>
          <UFormField label="Preisregel">
            <USelectMenu
              v-model="neu.preisregel"
              :items="regelOptionen"
              value-key="value"
              class="w-full"
            />
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

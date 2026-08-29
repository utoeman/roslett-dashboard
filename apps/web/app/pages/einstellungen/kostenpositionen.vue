<script setup lang="ts">
import type { Kostenposition } from '~/composables/useArtikel';

useHead({ title: 'Kostenpositionen' });

const { formatGeld, formatProzent } = useGeld();
const { leseFehler } = useApiFehler();

const { data, pending, refresh } = await useFetch<{ eintraege: Kostenposition[] }>(
  '/api/kostenpositionen',
);

const dialogOffen = ref(false);
const speichert = ref(false);
const meldung = ref<string | null>(null);
const formularFehler = ref<Record<string, string>>({});

const neu = reactive({
  bezeichnung: '',
  art: 'fix' as 'fix' | 'prozent',
  wert: '',
  vorsteuerabzugsfaehig: false,
  verteilmethode: 'wert' as 'wert' | 'stueckzahl',
});

const artOptionen = [
  { label: 'Fixbetrag', value: 'fix' },
  { label: 'Prozentsatz', value: 'prozent' },
];

const verteilOptionen = [
  { label: 'nach Warenwert', value: 'wert' },
  { label: 'nach Stückzahl', value: 'stueckzahl' },
];

async function anlegen() {
  speichert.value = true;
  meldung.value = null;
  formularFehler.value = {};
  try {
    await $fetch('/api/kostenpositionen', {
      method: 'POST',
      body: {
        bezeichnung: neu.bezeichnung,
        art: neu.art,
        wert: neu.wert,
        vorsteuerabzugsfaehig: neu.vorsteuerabzugsfaehig,
        verteilmethode: neu.verteilmethode,
      },
    });
    dialogOffen.value = false;
    neu.bezeichnung = '';
    neu.wert = '';
    neu.vorsteuerabzugsfaehig = false;
    await refresh();
  } catch (fehler) {
    const { meldung: text, felder } = leseFehler(fehler);
    meldung.value = text;
    formularFehler.value = felder;
  } finally {
    speichert.value = false;
  }
}

async function umschalten(k: Kostenposition) {
  try {
    await $fetch(`/api/kostenpositionen/${k.id}`, {
      method: 'PATCH',
      body: { art: k.art, aktiv: !k.aktiv },
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
      titel="Kostenpositionen"
      hinweis="Zuschläge auf den Einstandspreis. Übergreifende Positionen gelten für alle Artikel."
    >
      <template #aktionen>
        <UButton icon="i-lucide-plus" size="sm" class="rounded-[8px]" @click="dialogOffen = true">
          Position anlegen
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

      <div
        class="mb-4 rounded-[12px] border border-trdwarning-200 bg-trdwarning-50/50 px-4 py-3 text-sm dark:border-trdwarning-900 dark:bg-trdwarning-950/30"
        style="border-width: 0.5px"
      >
        <p class="font-medium">Vorsteuer und Selbstkosten</p>
        <p class="mt-0.5 text-zinc-600 dark:text-zinc-400">
          Einfuhrumsatzsteuer ist als Vorsteuer abziehbar und zählt nicht zu den
          Selbstkosten. Zoll ist nicht abziehbar und zählt mit. Markieren Sie
          abziehbare Positionen entsprechend.
        </p>
      </div>

      <div v-if="pending && !data" class="py-12 text-center text-sm text-zinc-500">
        Wird geladen …
      </div>

      <div
        v-else-if="!data?.eintraege.length"
        class="rounded-[12px] border border-zinc-200/70 py-16 text-center dark:border-zinc-800"
        style="border-width: 0.5px"
      >
        <p class="text-sm font-medium">Noch keine Kostenpositionen angelegt.</p>
        <p class="mt-1 text-sm text-zinc-500">
          Typisch sind Verpackung, Zoll und Einfuhrumsatzsteuer.
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
              <th class="px-4">Bezeichnung</th>
              <th class="px-4">Geltung</th>
              <th class="px-4 text-right">Wert</th>
              <th class="px-4">Vorsteuer</th>
              <th class="px-4">Verteilung</th>
              <th class="px-4">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-200/60 dark:divide-zinc-800/70">
            <tr v-for="k in data.eintraege" :key="k.id" :class="{ 'text-zinc-400': !k.aktiv }">
              <td class="px-4 font-medium">
                {{ k.bezeichnung }}
              </td>
              <td class="px-4 text-zinc-500">
                {{ k.varianteId ? 'Variante' : 'übergreifend' }}
              </td>
              <td class="zahl px-4">
                {{ k.art === 'fix' ? formatGeld(k.wert) : formatProzent(k.wert) }}
              </td>
              <td class="px-4">
                <UBadge
                  v-if="k.vorsteuerabzugsfaehig"
                  size="sm"
                  color="success"
                  variant="subtle"
                  class="rounded-[8px]"
                >
                  abziehbar
                </UBadge>
                <span v-else class="text-zinc-400">–</span>
              </td>
              <td class="px-4 text-zinc-500">
                {{ k.verteilmethode === 'wert' ? 'Warenwert' : 'Stückzahl' }}
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
                      ? 'Wird in der Kalkulation berücksichtigt. Klicken zum Deaktivieren.'
                      : 'Wird nicht berücksichtigt. Klicken zum Aktivieren.'
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
    </div>

    <UModal v-model:open="dialogOffen" title="Kostenposition anlegen">
      <template #body>
        <form class="space-y-4" @submit.prevent="anlegen">
          <UFormField label="Bezeichnung" required :error="formularFehler.bezeichnung">
            <UInput v-model="neu.bezeichnung" autofocus class="w-full" />
          </UFormField>

          <UFormField label="Art" required>
            <USelectMenu
              v-model="neu.art"
              :items="artOptionen"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="neu.art === 'fix' ? 'Betrag' : 'Satz'"
            required
            :error="formularFehler.wert"
            :help="neu.art === 'fix' ? 'Zum Beispiel 0,85' : 'Zum Beispiel 4,7 für 4,7 Prozent'"
          >
            <UInput v-model="neu.wert" class="w-full" />
          </UFormField>

          <UFormField
            label="Verteilung der Nebenkosten"
            help="Gilt für Fracht und Zoll, wenn eine Sendung mehrere Chargen enthält."
          >
            <USelectMenu
              v-model="neu.verteilmethode"
              :items="verteilOptionen"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <UCheckbox
            v-model="neu.vorsteuerabzugsfaehig"
            label="Vorsteuerabzugsfähig"
          />
          <p class="-mt-2 text-xs text-zinc-500">
            Abziehbare Positionen belasten die Marge nicht. Trifft auf die
            Einfuhrumsatzsteuer zu, nicht auf Zoll.
          </p>

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

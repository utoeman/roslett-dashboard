/**
 * Verzoegert einen Wert, damit nicht jeder Tastendruck eine Anfrage ausloest.
 *
 * Bewusst selbst geschrieben statt eine Bibliothek einzubinden: es sind
 * wenige Zeilen, und das Projekt soll keine Abhaengigkeit tragen, die
 * die Spezifikation nicht vorsieht.
 */
export function useEntprellt<T>(quelle: Ref<T>, verzoegerungMs = 250): Ref<T> {
  const ziel = ref(quelle.value) as Ref<T>;
  let zeitgeber: ReturnType<typeof setTimeout> | undefined;

  watch(quelle, (wert) => {
    if (zeitgeber !== undefined) clearTimeout(zeitgeber);
    zeitgeber = setTimeout(() => {
      ziel.value = wert;
    }, verzoegerungMs);
  });

  // Laufenden Zeitgeber abbrechen, wenn die Komponente verschwindet.
  onScopeDispose(() => {
    if (zeitgeber !== undefined) clearTimeout(zeitgeber);
  });

  return ziel;
}

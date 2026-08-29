/**
 * Verzoegert einen Wert, damit nicht jeder Tastendruck eine Anfrage ausloest.
 *
 * Bewusst selbst geschrieben statt eine Bibliothek einzubinden: es sind
 * wenige Zeilen, und das Projekt soll keine Abhaengigkeit tragen, die die
 * Spezifikation nicht vorsieht.
 */
export function useDebounced<T>(source: Ref<T>, delayMs = 250): Ref<T> {
  const target = ref(source.value) as Ref<T>;
  let timer: ReturnType<typeof setTimeout> | undefined;

  watch(source, (value) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      target.value = value;
    }, delayMs);
  });

  // Laufenden Zeitgeber abbrechen, wenn die Komponente verschwindet.
  onScopeDispose(() => {
    if (timer !== undefined) clearTimeout(timer);
  });

  return target;
}

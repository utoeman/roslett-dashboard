/** Debounces a value so not every keystroke triggers a request. */
export function useDebounced<T>(source: Ref<T>, delayMs = 250): Ref<T> {
  const target = ref(source.value) as Ref<T>;
  let timer: ReturnType<typeof setTimeout> | undefined;

  watch(source, (value) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      target.value = value;
    }, delayMs);
  });

  // Clear the pending timer on unmount.
  onScopeDispose(() => {
    if (timer !== undefined) clearTimeout(timer);
  });

  return target;
}

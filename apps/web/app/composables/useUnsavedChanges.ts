/**
 * Asks before leaving a page with unsaved input: on navigation inside the app
 * and on reload or closing the tab. `allowLeave` skips the question once, for
 * navigations that follow a deliberate action such as deleting.
 */
export function useUnsavedChanges(isDirty: () => boolean) {
  let allowed = false;

  onBeforeRouteLeave(() => {
    if (allowed || !isDirty()) return true;
    return window.confirm('Es gibt ungespeicherte Änderungen. Seite trotzdem verlassen?');
  });

  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (allowed || !isDirty()) return;
    event.preventDefault();
  };
  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload));
  onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload));

  return {
    allowLeave: () => {
      allowed = true;
    },
  };
}

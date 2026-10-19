/**
 * Ohne Anmeldung fuehrt jede Seite zur Anmeldeseite; die gewuenschte Adresse
 * wandert als ?weiter= mit und wird nach dem Login wieder aufgerufen.
 */
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession();

  if (to.path === '/login') {
    return loggedIn.value ? navigateTo('/') : undefined;
  }
  if (!loggedIn.value) {
    return navigateTo({ path: '/login', query: to.fullPath === '/' ? {} : { weiter: to.fullPath } });
  }
});

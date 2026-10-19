/** Redirects to /login when signed out; the target is kept in ?weiter=. */
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession();

  if (to.path === '/login') {
    return loggedIn.value ? navigateTo('/') : undefined;
  }
  if (!loggedIn.value) {
    return navigateTo({ path: '/login', query: to.fullPath === '/' ? {} : { weiter: to.fullPath } });
  }
});

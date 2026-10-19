/** Clears the server cookie first, then the client session state. */
export function useLogout() {
  const { clear } = useUserSession();

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' });
    await clear();
    await navigateTo('/login');
  }

  return { logout };
}

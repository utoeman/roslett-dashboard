/**
 * Abmelden aus beiden Navigationen (breit und schmal).
 *
 * Erst das Cookie auf dem Server loeschen, dann den Sitzungszustand im Browser
 * leeren; sonst haelt die Oberflaeche die Nutzerin noch fuer angemeldet.
 */
export function useLogout() {
  const { clear } = useUserSession();

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' });
    await clear();
    await navigateTo('/login');
  }

  return { logout };
}

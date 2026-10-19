/** Abmelden: loescht das Sitzungscookie. */
export default defineEventHandler(async (event) => {
  await clearUserSession(event);
  return { ok: true };
});

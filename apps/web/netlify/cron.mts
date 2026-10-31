/**
 * Shared by the scheduled functions: they only trigger the app's cron route,
 * so the import logic stays in one place (Nitro). Netlify runs scheduled
 * functions on published deploys only, against the site's main URL.
 */
export async function triggerShopifySync(scope: 'scheduled' | 'nightly'): Promise<void> {
  const base = process.env.URL;
  const secret = process.env.NUXT_CRON_SECRET;
  if (!base || !secret) {
    console.error('Shopify-Abruf übersprungen: URL oder NUXT_CRON_SECRET fehlt.');
    return;
  }
  const url = new URL('/api/cron/shopify-sync', base);
  if (scope === 'nightly') url.searchParams.set('scope', 'nightly');
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(25_000),
  });
  const body = await response.text();
  // The result is stored by the app; the log is only for the Netlify function view.
  if (!response.ok) console.error(`Shopify-Abruf fehlgeschlagen: HTTP ${response.status} ${body.slice(0, 500)}`);
  else console.log(`Shopify-Abruf (${scope}): ${body.slice(0, 500)}`);
}

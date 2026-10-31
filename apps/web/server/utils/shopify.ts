/**
 * Shopify Admin GraphQL access via the client credentials grant (G3). Tokens
 * live 24 h and are cached per function instance; a cold start fetches anew.
 */

import { createError } from 'h3';
import type { ShopifyVariantRef } from '@roslett/core';

export const SHOPIFY_API_VERSION = '2026-10';

interface ShopifyConfig {
  shop: string;
  clientId: string;
  clientSecret: string;
}

let cachedToken: { value: string; expiresAt: number } | undefined;

export function shopifyConfig(): ShopifyConfig | null {
  const { shop, clientId, clientSecret } = useRuntimeConfig().shopify;
  return shop && clientId && clientSecret ? { shop, clientId, clientSecret } : null;
}

function unavailable(message: string) {
  return createError({ statusCode: 502, statusMessage: 'Shopify nicht erreichbar', data: { fehler: message } });
}

async function accessToken(config: ShopifyConfig): Promise<string> {
  // Renew a minute early so a request never starts with an expiring token.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  let response: Response;
  try {
    response = await fetch(`https://${config.shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw unavailable('Shopify hat nicht geantwortet. Bitte später erneut versuchen.');
  }
  if (!response.ok) {
    throw unavailable('Shopify hat den Zugang abgelehnt. Bitte Client-ID, Client-Secret und die Installation der App prüfen.');
  }
  const body = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

/** `language` localises names Shopify translates itself (e.g. the product taxonomy). */
export async function shopifyGraphql<T>(
  query: string,
  variables: Record<string, unknown> = {},
  options: { language?: string } = {},
): Promise<T> {
  const config = shopifyConfig();
  if (!config) throw unavailable('Die Shopify-Anbindung ist nicht eingerichtet.');
  const token = await accessToken(config);
  let response: Response;
  try {
    response = await fetch(`https://${config.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
        ...(options.language ? { 'Accept-Language': options.language } : {}),
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw unavailable('Shopify hat nicht geantwortet. Bitte später erneut versuchen.');
  }
  const body = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (!response.ok || body.errors?.length || !body.data) {
    if (response.status === 401) cachedToken = undefined;
    const detail = body.errors?.map((e) => e.message).join('; ') ?? `HTTP ${response.status}`;
    throw unavailable(`Shopify-Abfrage fehlgeschlagen: ${detail}`);
  }
  return body.data;
}

interface VariantPage {
  productVariants: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: {
      id: string;
      sku: string | null;
      inventoryQuantity: number | null;
      price: string;
      product: { id: string };
      inventoryItem: { id: string; unitCost: { amount: string } | null };
    }[];
  };
}

/** All Shopify variants; 250 per page is the API maximum. */
export async function fetchShopifyVariants(): Promise<ShopifyVariantRef[]> {
  const result: ShopifyVariantRef[] = [];
  let after: string | null = null;
  do {
    const page: VariantPage = await shopifyGraphql<VariantPage>(
      `query Variants($after: String) {
        productVariants(first: 250, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes { id sku inventoryQuantity price product { id } inventoryItem { id unitCost { amount } } }
        }
      }`,
      { after },
    );
    for (const node of page.productVariants.nodes) {
      result.push({
        sku: node.sku,
        productId: node.product.id,
        variantId: node.id,
        inventoryItemId: node.inventoryItem.id,
        inventoryQuantity: node.inventoryQuantity ?? 0,
        price: node.price,
        unitCost: node.inventoryItem.unitCost?.amount ?? null,
      });
    }
    after = page.productVariants.pageInfo.hasNextPage ? page.productVariants.pageInfo.endCursor : null;
  } while (after);
  return result;
}

/**
 * Links dashboard variants to Shopify variants. The SKU is the only key across
 * systems (invariant 5); Shopify allows duplicate SKUs, so those are reported
 * instead of guessed.
 */

export interface DashboardVariantRef {
  variantId: string;
  sku: string;
}

export interface ShopifyVariantRef {
  sku: string | null;
  productId: string;
  variantId: string;
  inventoryItemId: string;
  /** Shopify's total available quantity across locations. */
  inventoryQuantity: number;
}

export interface VariantMatch {
  variantId: string;
  sku: string;
  shopify: ShopifyVariantRef;
}

export interface MatchResult {
  matched: VariantMatch[];
  /** Dashboard variants without a Shopify counterpart. */
  missingInShopify: DashboardVariantRef[];
  /** Shopify variants whose SKU is empty or unknown to the dashboard. */
  unknownInShopify: ShopifyVariantRef[];
  /** SKUs used by more than one Shopify variant; never linked automatically. */
  duplicateInShopify: string[];
}

const normalize = (sku: string): string => sku.trim().toUpperCase();

export function matchShopifyVariants(
  dashboard: readonly DashboardVariantRef[],
  shopify: readonly ShopifyVariantRef[],
): MatchResult {
  const bySku = new Map<string, ShopifyVariantRef[]>();
  const unknownInShopify: ShopifyVariantRef[] = [];
  for (const variant of shopify) {
    const key = variant.sku ? normalize(variant.sku) : '';
    if (key === '') {
      unknownInShopify.push(variant);
      continue;
    }
    bySku.set(key, [...(bySku.get(key) ?? []), variant]);
  }

  const matched: VariantMatch[] = [];
  const missingInShopify: DashboardVariantRef[] = [];
  const duplicateInShopify: string[] = [];
  const known = new Set<string>();
  for (const variant of dashboard) {
    const key = normalize(variant.sku);
    known.add(key);
    const hits = bySku.get(key) ?? [];
    if (hits.length === 0) missingInShopify.push(variant);
    else if (hits.length > 1) duplicateInShopify.push(variant.sku);
    else matched.push({ variantId: variant.variantId, sku: variant.sku, shopify: hits[0] as ShopifyVariantRef });
  }

  for (const [key, hits] of bySku) {
    if (!known.has(key)) unknownInShopify.push(...hits);
  }
  // Keep Shopify's order so the list reads like the admin.
  unknownInShopify.sort((a, b) => shopify.indexOf(a) - shopify.indexOf(b));

  return { matched, missingInShopify, unknownInShopify, duplicateInShopify };
}

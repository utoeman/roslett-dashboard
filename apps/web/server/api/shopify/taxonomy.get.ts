import { z } from 'zod';
import type { ShopifyTaxonomyCategory } from '../../../shared/types/api.js';
import { readQuery } from '../../utils/validation.js';
import { shopifyGraphql } from '../../utils/shopify.js';

const querySchema = z.object({ search: z.string().trim().min(2).max(100) });

/** Search in Shopify's standard product taxonomy (English names), for the category setting. */
export default defineEventHandler(async (event): Promise<ShopifyTaxonomyCategory[]> => {
  const { search } = readQuery(event, querySchema);
  const data = await shopifyGraphql<{ taxonomy: { categories: { nodes: { id: string; fullName: string }[] } } }>(
    `query Taxonomy($search: String!) { taxonomy { categories(search: $search, first: 15) { nodes { id fullName } } } }`,
    { search },
  );
  return data.taxonomy.categories.nodes.map((c) => ({ id: c.id, name: c.fullName }));
});

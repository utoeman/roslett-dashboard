import { eq } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { updateCostItemSchema } from '../../../shared/schemas/cost-item.js';
import { readJsonBody, readId, requireFound } from '../../utils/validation.js';
import { badRequest, databaseError } from '../../utils/errors.js';
import { centsToNumeric, rateToNumeric } from '../../utils/money.js';
import { mapCostItem } from '../../utils/mapping.js';

/** Deactivate with `active: false`; never delete, past calculations depend on it. */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const input = await readJsonBody(event, updateCostItemSchema);
  const db = useDb();

  const existing = requireFound(
    await db.query.costItems.findFirst({
      where: eq(schema.costItems.id, id),
      columns: { id: true, kind: true },
    }),
    'Die Kostenposition',
  );

  // Changing `kind` without a new value would reinterpret the stored number
  // (4.7 % would become 5 cents), so a value is required.
  if (input.kind !== existing.kind && input.value === undefined) {
    throw badRequest(
      'Beim Wechsel zwischen Fixbetrag und Prozentsatz muss der Wert neu angegeben werden.',
      { value: 'Wert erforderlich.' },
    );
  }

  const changes: Record<string, unknown> = { kind: input.kind };
  if (input.value !== undefined) {
    changes.value =
      input.kind === 'fix'
        ? centsToNumeric(input.value)
        : rateToNumeric(input.value);
  }
  if (input.label !== undefined) changes.label = input.label;
  if (input.variantId !== undefined) changes.variantId = input.variantId;
  if (input.inputTaxDeductible !== undefined)
    changes.inputTaxDeductible = input.inputTaxDeductible;
  if (input.active !== undefined) changes.active = input.active;
  if (input.distributionMethod !== undefined)
    changes.distributionMethod = input.distributionMethod;

  try {
    const [updated] = await db
      .update(schema.costItems)
      .set(changes)
      .where(eq(schema.costItems.id, id))
      .returning();
    return mapCostItem(requireFound(updated, 'Die Kostenposition'));
  } catch (error) {
    throw databaseError(error, 'Kostenposition aendern');
  }
});

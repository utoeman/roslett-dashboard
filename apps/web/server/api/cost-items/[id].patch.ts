import { eq } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { updateCostItemSchema } from '../../../shared/schemas/cost-item.js';
import { readBody, readId, requireFound } from '../../utils/validation.js';
import { badRequest, databaseError } from '../../utils/errors.js';
import { centsToNumeric, rateToNumeric } from '../../utils/money.js';
import { mapCostItem } from '../../utils/mapping.js';

/**
 * Kostenposition aendern.
 *
 * Deaktiviert wird ueber `active: false` – geloescht wird nichts, weil
 * vergangene Kalkulationen sonst nicht mehr nachvollziehbar waeren.
 */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const input = await readBody(event, updateCostItemSchema);
  const db = useDb();

  const existing = requireFound(
    await db.query.costItems.findFirst({
      where: eq(schema.costItems.id, id),
      columns: { id: true, kind: true },
    }),
    'Die Kostenposition',
  );

  /*
   * Ein Wechsel der Art ohne neuen Wert wuerde die gespeicherte Zahl
   * stillschweigend umdeuten: aus "percent 0.0470" (4,7 Prozent) wuerde
   * "fix 0.0470", gelesen als 5 Cent. Deshalb verlangen wir bei einem
   * Artwechsel ausdruecklich einen neuen Wert.
   */
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

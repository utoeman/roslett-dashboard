import { schema, useDb } from '../../db/client.js';
import { createCostItemSchema } from '../../../shared/schemas/cost-item.js';
import { readJsonBody, requireFound } from '../../utils/validation.js';
import { databaseError } from '../../utils/errors.js';
import { centsToNumeric, rateToNumeric } from '../../utils/money.js';
import { mapCostItem } from '../../utils/mapping.js';

/**
 * Kostenposition anlegen.
 *
 * Der Wert wird je nach Art unterschiedlich abgelegt: ein Fixbetrag als
 * Euro-Wert, eine Rate als Dezimalzahl. Das Schema hat ihn bereits
 * entsprechend geparst, hier folgt nur noch die Umrechnung fuer die Spalte.
 */
export default defineEventHandler(async (event) => {
  const input = await readJsonBody(event, createCostItemSchema);
  try {
    const [item] = await useDb()
      .insert(schema.costItems)
      .values({
        variantId: input.variantId ?? null,
        label: input.label,
        kind: input.kind,
        value:
          input.kind === 'fix'
            ? (centsToNumeric(input.value) ?? '0')
            : (rateToNumeric(input.value) ?? '0'),
        inputTaxDeductible: input.inputTaxDeductible,
        active: input.active,
        distributionMethod: input.distributionMethod,
      })
      .returning();
    setResponseStatus(event, 201);
    return mapCostItem(requireFound(item, 'Die Kostenposition'));
  } catch (error) {
    throw databaseError(error, 'Kostenposition anlegen');
  }
});
